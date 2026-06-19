from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from transaction_service.models import SendCryptoRequest, TransactionResponse, FeeEstimateRequest, FeeEstimateResponse
from transaction_service.services import initiate_send_crypto, estimate_fee, get_transaction_history
from shared.database import get_db
from shared.security import get_current_user

router = APIRouter()

@router.post("/send")
async def send_crypto(req: SendCryptoRequest, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await initiate_send_crypto(req, current_user["id"], current_user["email"], db)

@router.post("/estimate-fee", response_model=FeeEstimateResponse)
async def estimate_network_fee(req: FeeEstimateRequest, current_user: dict = Depends(get_current_user)):
    return await estimate_fee(req.asset_symbol)

@router.get("/history", response_model=List[TransactionResponse])
async def transaction_history(skip: int = Query(0, ge=0), limit: int = Query(50, le=500), current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await get_transaction_history(db, current_user["id"], skip, limit)
