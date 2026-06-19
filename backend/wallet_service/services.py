import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from wallet_service.models import Wallet, Balance
from fastapi import HTTPException
from wallet_service.hd_engine import derive_evm_address
from shared.web3_client import Web3ClientManager

from sqlalchemy import func

async def create_wallet_for_user(db: AsyncSession, user_id: int, asset_symbol: str) -> Wallet:
    # Check if a wallet already exists for this user
    result = await db.execute(select(Wallet).where(Wallet.user_id == user_id).options(selectinload(Wallet.balances)))
    existing_wallet = result.scalars().first()
    
    if existing_wallet:
        wallet = existing_wallet
        balance_entry = next((b for b in wallet.balances if b.asset_symbol == asset_symbol), None)
    else:
        # Create a new wallet with index=0 to ensure 1 unique address per user
        derived = derive_evm_address(user_id, 0)
        wallet = Wallet(
            user_id=user_id, 
            public_address=derived["address"],
            encrypted_key=derived["encrypted_key"]
        )
        db.add(wallet)
        await db.commit()
        await db.refresh(wallet)
        balance_entry = None
    
    if not balance_entry:
        new_balance = Balance(wallet_id=wallet.id, asset_symbol=asset_symbol, amount=0.0)
        db.add(new_balance)
        await db.commit()
        
    # Re-fetch to return full state
    result = await db.execute(
        select(Wallet).where(Wallet.id == wallet.id).options(selectinload(Wallet.balances))
    )
    return result.scalars().first()

async def get_user_wallets(db: AsyncSession, user_id: int):
    result = await db.execute(
        select(Wallet).where(Wallet.user_id == user_id).options(selectinload(Wallet.balances))
    )
    return result.scalars().all()

async def get_wallet_by_id(db: AsyncSession, wallet_id: int, user_id: int):
    result = await db.execute(
        select(Wallet).where(Wallet.id == wallet_id, Wallet.user_id == user_id).options(selectinload(Wallet.balances))
    )
    wallet = result.scalars().first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return wallet

async def get_aggregated_balances(db: AsyncSession, user_id: int):
    wallets = await get_user_wallets(db, user_id)
    aggregated = {}
    
    for wallet in wallets:
        # Load local balances for ALL assets
        for balance in wallet.balances:
            aggregated[balance.asset_symbol] = aggregated.get(balance.asset_symbol, 0.0) + float(balance.amount)
            
    return [{"asset_symbol": k, "amount": v} for k, v in aggregated.items()]

async def fund_wallet_faucet(db: AsyncSession, address: str, asset_symbol: str, amount: float):
    # Find the wallet by public_address
    result = await db.execute(select(Wallet).where(Wallet.public_address == address).options(selectinload(Wallet.balances)))
    wallet = result.scalars().first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
        
    # Find the balance entry for the asset
    balance_entry = next((b for b in wallet.balances if b.asset_symbol == asset_symbol), None)
    
    if balance_entry:
        balance_entry.amount = float(balance_entry.amount) + amount
    else:
        new_balance = Balance(wallet_id=wallet.id, asset_symbol=asset_symbol, amount=amount)
        db.add(new_balance)
        
    await db.commit()
    return {"message": f"Successfully added {amount} {asset_symbol} to {address}"}
