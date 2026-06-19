from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from pydantic import BaseModel
from typing import List, Optional
from shared.database import Base

class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False) # Maps to users table logically
    public_address = Column(String, unique=True, index=True, nullable=False)
    encrypted_key = Column(String, nullable=False, default="mock_key")
    created_at = Column(DateTime, default=datetime.utcnow)

    balances = relationship("Balance", back_populates="wallet", cascade="all, delete")

class Balance(Base):
    __tablename__ = "balances"

    id = Column(Integer, primary_key=True, index=True)
    wallet_id = Column(Integer, ForeignKey("wallets.id"), nullable=False)
    asset_symbol = Column(String, index=True, nullable=False) # e.g., 'BTC', 'ETH'
    amount = Column(Numeric(precision=24, scale=8), default=0.0) # High precision for crypto

    wallet = relationship("Wallet", back_populates="balances")

# Pydantic schemas
class BalanceResponse(BaseModel):
    asset_symbol: str
    amount: float

    class Config:
        from_attributes = True

class CreateWalletRequest(BaseModel):
    asset_symbol: str
    name: Optional[str] = None

class WalletResponse(BaseModel):
    id: int
    user_id: int
    public_address: str
    balances: List[BalanceResponse] = []

    class Config:
        from_attributes = True

class FaucetFundRequest(BaseModel):
    address: str
    asset_symbol: str
    amount: float
