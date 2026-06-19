import random
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from shared.cache import get_redis
from shared.security import get_password_hash, verify_password, create_access_token
from auth_service.models import User, UserCreate
from fastapi import HTTPException

# Store OTPs with a prefix and a 5-minute expiration
OTP_TTL_SECONDS = 300 

async def create_user(db: AsyncSession, user_data: UserCreate):
    # Check if user exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create new user
    hashed_pw = get_password_hash(user_data.password)
    new_user = User(email=user_data.email, hashed_password=hashed_pw, full_name=user_data.full_name)
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

async def get_user_by_email(db: AsyncSession, email: str):
    result = await db.execute(select(User).where(User.email == email))
    return result.scalars().first()

from shared.email_utils import send_otp_email

async def generate_and_send_otp(email: str):
    redis = await get_redis()
    otp = str(random.randint(100000, 999999))
    # Store in Redis
    await redis.setex(f"otp:{email}", OTP_TTL_SECONDS, otp)
    
    # Send actual email
    subject = "Your Crypto Dashboard Verification Code"
    body = f"Welcome to CryptoVault!\n\nYour OTP code is: {otp}\n\nIt will expire in 5 minutes.\nDo not share this code with anyone."
    await send_otp_email(email, subject, body)
    
    return True

async def verify_otp(email: str, otp: str, db: AsyncSession):
    redis = await get_redis()
    stored_otp = await redis.get(f"otp:{email}")
    
    if not stored_otp or stored_otp != otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    
    # OTP is valid, verify the user
    user = await get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.is_verified = True
    await db.commit()
    
    # Clear the OTP
    await redis.delete(f"otp:{email}")
    return True
