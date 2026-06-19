from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from fastapi import HTTPException
from staking_service.models import Stake, Reward, StakeRequest, UnstakeResponse
from shared.messaging import publish_message

def calculate_dynamic_reward(principal: float, apy: float, start_time: datetime) -> float:
    # APY is Annual Percentage Yield. We calculate reward per second for testing.
    # apy = 5.0 means 5%.
    seconds_in_year = 365 * 24 * 60 * 60
    elapsed_seconds = (datetime.utcnow() - start_time).total_seconds()
    
    annual_reward = principal * (apy / 100.0)
    reward_per_second = annual_reward / seconds_in_year
    
    return reward_per_second * elapsed_seconds

async def create_stake(req: StakeRequest, user_id: int, db: AsyncSession):
    new_stake = Stake(
        user_id=user_id,
        wallet_id=req.wallet_id,
        asset_symbol=req.asset_symbol,
        principal_amount=req.amount,
        apy=req.apy,
        status="pending"
    )
    db.add(new_stake)
    await db.commit()
    await db.refresh(new_stake)
    
    # Notify worker to lock balance
    await publish_message("staking_queue", {
        "action": "lock_balance",
        "stake_id": new_stake.id,
        "wallet_id": req.wallet_id,
        "asset_symbol": req.asset_symbol,
        "amount": req.amount
    })
    
    return new_stake

async def unstake_asset(stake_id: int, user_id: int, db: AsyncSession) -> UnstakeResponse:
    result = await db.execute(select(Stake).where(Stake.id == stake_id, Stake.user_id == user_id, Stake.status == "active"))
    stake = result.scalars().first()
    
    if not stake:
        raise HTTPException(status_code=404, detail="Active stake not found")
        
    reward_earned = calculate_dynamic_reward(float(stake.principal_amount), float(stake.apy), stake.start_time)
    
    stake.status = "unstaked"
    new_reward = Reward(stake_id=stake.id, amount=reward_earned)
    db.add(new_reward)
    await db.commit()
    
    # Notify worker to unlock balance and add reward
    await publish_message("staking_queue", {
        "action": "unlock_balance",
        "wallet_id": stake.wallet_id,
        "asset_symbol": stake.asset_symbol,
        "principal": float(stake.principal_amount),
        "reward": reward_earned
    })
    
    return UnstakeResponse(
        stake_id=stake.id,
        principal_returned=float(stake.principal_amount),
        reward_earned=reward_earned
    )

async def get_portfolio(user_id: int, db: AsyncSession):
    result = await db.execute(select(Stake).where(Stake.user_id == user_id, Stake.status == "active"))
    stakes = result.scalars().all()
    
    portfolio = []
    for s in stakes:
        curr_reward = calculate_dynamic_reward(float(s.principal_amount), float(s.apy), s.start_time)
        portfolio.append({
            "id": s.id,
            "stake_id": s.id,
            "user_id": s.user_id,
            "wallet_id": s.wallet_id,
            "asset_symbol": s.asset_symbol,
            "principal_amount": float(s.principal_amount),
            "current_reward": curr_reward,
            "apy": float(s.apy),
            "start_time": s.start_time.isoformat() if s.start_time else None,
            "status": s.status
        })
    return portfolio
