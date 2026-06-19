from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey
from datetime import datetime
from shared.database import Base
from pydantic import BaseModel
from typing import List, Optional

class Stake(Base):
    __tablename__ = "stakes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    wallet_id = Column(Integer, nullable=False)
    asset_symbol = Column(String, index=True, nullable=False)
    principal_amount = Column(Numeric(precision=24, scale=8), nullable=False)
    apy = Column(Numeric(precision=5, scale=2), default=5.00) # e.g. 5.00 for 5%
    start_time = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="active") # active, unstaked

class Reward(Base):
    __tablename__ = "rewards"

    id = Column(Integer, primary_key=True, index=True)
    stake_id = Column(Integer, ForeignKey("stakes.id"), nullable=False)
    amount = Column(Numeric(precision=24, scale=8), nullable=False)
    claimed_at = Column(DateTime, default=datetime.utcnow)

# Pydantic Schemas
class StakeRequest(BaseModel):
    wallet_id: int
    asset_symbol: str
    amount: float
    apy: float = 5.0

class StakeResponse(BaseModel):
    id: int
    user_id: int
    asset_symbol: str
    principal_amount: float
    apy: float
    start_time: datetime
    status: str

    class Config:
        from_attributes = True

class UnstakeRequest(BaseModel):
    stake_id: int

class UnstakeResponse(BaseModel):
    stake_id: int
    principal_returned: float
    reward_earned: float
