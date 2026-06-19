from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from auth_service.models import UserCreate, UserResponse, LoginRequest, OTPVerify, Token
from auth_service.services import create_user, generate_and_send_otp, verify_otp, get_user_by_email
from shared.database import get_db
from shared.security import verify_password, create_access_token, get_current_user

router = APIRouter()

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(user_dict: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, user_dict["email"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(user: UserCreate, db: AsyncSession = Depends(get_db)):
    new_user = await create_user(db, user)
    return new_user

@router.post("/send-otp")
async def send_otp(email: str):
    # In a real scenario, you'd check if the email exists first or allow sending regardless (for register vs login)
    await generate_and_send_otp(email)
    return {"message": "OTP sent successfully (check console)"}

@router.post("/login", response_model=Token)
async def login(login_req: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, login_req.email)
    if not user or not verify_password(login_req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # For extra security, if the user isn't verified, require OTP verification first
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="User not verified. Please verify OTP first.")
        
    # Generate JWT
    access_token = create_access_token(data={"sub": user.email, "id": user.id})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/verify-otp")
async def verify_user_otp(otp_data: OTPVerify, db: AsyncSession = Depends(get_db)):
    await verify_otp(otp_data.email, otp_data.otp, db)
    return {"message": "Email verified successfully"}
