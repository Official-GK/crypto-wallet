from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from staking_service.models import StakeRequest, StakeResponse, UnstakeRequest, UnstakeResponse
from staking_service.services import create_stake, unstake_asset, get_portfolio
from shared.database import get_db
from shared.security import get_current_user_id

router = APIRouter()

@router.post("/", response_model=StakeResponse)
async def stake_asset(req: StakeRequest, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await create_stake(req, user_id, db)

@router.post("/unstake", response_model=UnstakeResponse)
async def unstake(req: UnstakeRequest, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await unstake_asset(req.stake_id, user_id, db)

@router.get("/portfolio", response_model=List[Dict[str, Any]])
async def fetch_portfolio(user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await get_portfolio(user_id, db)
