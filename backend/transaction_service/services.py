import json
import uuid
import random
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from transaction_service.models import Transaction, SendCryptoRequest, FeeEstimateResponse
from wallet_service.models import Wallet
from shared.cache import get_redis
from shared.messaging import publish_message

OTP_TTL_SECONDS = 300

from shared.email_utils import send_otp_email

async def trigger_otp_for_tx(user_email: str):
    redis = await get_redis()
    otp = str(random.randint(100000, 999999))
    await redis.setex(f"tx_otp:{user_email}", OTP_TTL_SECONDS, otp)
    
    # Send actual email
    subject = "CryptoVault: Transaction Authorization Code"
    body = f"You have initiated a transaction.\n\nYour authorization OTP code is: {otp}\n\nIt will expire in 5 minutes.\nIf you did not initiate this transaction, please secure your account immediately."
    await send_otp_email(user_email, subject, body)

async def initiate_send_crypto(req: SendCryptoRequest, user_id: int, user_email: str, db: AsyncSession):
    redis = await get_redis()
    
    # 1. If no OTP provided, cache the request and send OTP
    if not req.otp:
        await redis.setex(f"pending_tx:{user_email}", OTP_TTL_SECONDS, req.model_dump_json())
        await trigger_otp_for_tx(user_email)
        return {"message": "OTP sent to your email. Please submit again with the OTP.", "status": "otp_required"}
        
    # 2. If OTP provided, verify it
    stored_otp = await redis.get(f"tx_otp:{user_email}")
    if not stored_otp or stored_otp != req.otp:
        raise HTTPException(status_code=400, detail="Invalid or expired transaction OTP")
        
    # 3. OTP valid, create Transaction record
    new_tx = Transaction(
        user_id=user_id,
        from_address=req.from_address,
        to_address=req.to_address,
        asset_symbol=req.asset_symbol,
        amount=req.amount,
        status="pending"
    )
    db.add(new_tx)
    await db.commit()
    await db.refresh(new_tx)
    
    # Clear the cache
    await redis.delete(f"tx_otp:{user_email}")
    await redis.delete(f"pending_tx:{user_email}")
    
    # 4. Fetch current USD value to append for Fraud Service
    market_data = await redis.get("market_prices")
    usd_value = 0.0
    if market_data:
        prices = json.loads(market_data)
        if new_tx.asset_symbol in prices:
            usd_value = float(new_tx.amount) * prices[new_tx.asset_symbol]["price"]
            
    # 5. Push to RabbitMQ (fraud_queue) for async processing and risk check
    message = {
        "tx_id": new_tx.id,
        "from_address": new_tx.from_address,
        "to_address": new_tx.to_address,
        "amount": float(new_tx.amount),
        "asset_symbol": new_tx.asset_symbol,
        "usd_value": usd_value,
        "user_email": user_email
    }
    await publish_message("fraud_queue", message)
    
    return {"message": "Transaction verified and queued for processing", "transaction": new_tx}

async def estimate_fee(asset_symbol: str) -> FeeEstimateResponse:
    # Mock fee logic
    fees = {
        "BTC": 0.0001,
        "ETH": 0.005,
        "USDT": 5.0
    }
    return FeeEstimateResponse(
        asset_symbol=asset_symbol,
        estimated_fee=fees.get(asset_symbol.upper(), 0.01),
        network=f"{asset_symbol.upper()} Network"
    )

async def get_transaction_history(db: AsyncSession, user_id: int, skip: int = 0, limit: int = 50):
    # Fetch user's wallets
    wallet_res = await db.execute(select(Wallet).where(Wallet.user_id == user_id))
    wallets = wallet_res.scalars().all()
    wallet_addresses = [w.public_address for w in wallets]
    
    if wallet_addresses:
        stmt = select(Transaction).where(
            (Transaction.user_id == user_id) |
            (Transaction.from_address.in_(wallet_addresses)) |
            (Transaction.to_address.in_(wallet_addresses) & (Transaction.status == 'completed'))
        ).offset(skip).limit(limit).order_by(Transaction.timestamp.desc())
    else:
        stmt = select(Transaction).where(Transaction.user_id == user_id).offset(skip).limit(limit).order_by(Transaction.timestamp.desc())
        
    result = await db.execute(stmt)
    return result.scalars().all()
