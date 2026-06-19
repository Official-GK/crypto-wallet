from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from wallet_service.models import WalletResponse
from wallet_service.services import create_wallet_for_user, get_user_wallets, get_wallet_by_id, get_aggregated_balances
from shared.database import get_db
from shared.security import get_current_user_id

router = APIRouter()

from wallet_service.models import WalletResponse, CreateWalletRequest

@router.post("/create", response_model=WalletResponse)
async def create_wallet(req: CreateWalletRequest, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await create_wallet_for_user(db, user_id, req.asset_symbol)

@router.get("/list", response_model=List[WalletResponse])
async def list_wallets(user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await get_user_wallets(db, user_id)

@router.get("/balance", response_model=List[Dict[str, Any]])
async def get_balance(user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await get_aggregated_balances(db, user_id)

@router.get("/{wallet_id}", response_model=WalletResponse)
async def get_wallet(wallet_id: int, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await get_wallet_by_id(db, wallet_id, user_id)

from wallet_service.models import FaucetFundRequest
from wallet_service.services import fund_wallet_faucet

@router.post("/admin/faucet-fund")
async def faucet_fund(req: FaucetFundRequest, db: AsyncSession = Depends(get_db)):
    # Unrestricted admin route for testing
    return await fund_wallet_faucet(db, req.address, req.asset_symbol, req.amount)
