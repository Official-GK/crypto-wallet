from sqlalchemy import Column, Integer, String, Boolean
from pydantic import BaseModel, EmailStr
from shared.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    is_verified = Column(Boolean, default=False)

# Pydantic Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str | None = None
    is_verified: bool

    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class OTPVerify(BaseModel):
    email: EmailStr
    otp: str

class Token(BaseModel):
    access_token: str
    token_type: str
