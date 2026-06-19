from sqlalchemy import Column, Integer, String, Numeric, DateTime
from datetime import datetime
from pydantic import BaseModel
from shared.database import Base
from typing import Optional

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    from_address = Column(String, nullable=False)
    to_address = Column(String, nullable=False)
    asset_symbol = Column(String, nullable=False)
    amount = Column(Numeric(precision=24, scale=8), nullable=False)
    status = Column(String, default="pending") # pending, completed, failed
    timestamp = Column(DateTime, default=datetime.utcnow)
    tx_hash = Column(String, nullable=True) # Populated after blockchain conf

# Pydantic Schemas
class SendCryptoRequest(BaseModel):
    from_address: str
    to_address: str
    asset_symbol: str
    amount: float
    otp: Optional[str] = None # Optional for the first step

class TransactionResponse(BaseModel):
    id: int
    from_address: str
    to_address: str
    asset_symbol: str
    amount: float
    status: str
    timestamp: datetime
    tx_hash: Optional[str]

    class Config:
        from_attributes = True

class FeeEstimateRequest(BaseModel):
    asset_symbol: str
    amount: float

class FeeEstimateResponse(BaseModel):
    asset_symbol: str
    estimated_fee: float
    network: str
