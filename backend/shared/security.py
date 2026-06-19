from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError
from passlib.context import CryptContext
from shared.config import settings
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id: int = payload.get("id")
        email: str = payload.get("sub")
        if user_id is None or email is None:
            raise credentials_exception
        return {"id": user_id, "email": email}
    except JWTError:
        raise credentials_exception

def get_current_user_id(token: str = Depends(oauth2_scheme)) -> int:
    user = get_current_user(token)
    return user["id"]

from cryptography.fernet import Fernet
import os

ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "c3VwZXItc2VjcmV0LWtleS1jaGFuZ2UtbWUtbm93ISE=")
fernet = Fernet(ENCRYPTION_KEY.encode())

def encrypt_data(data: str) -> str:
    return fernet.encrypt(data.encode()).decode()

def decrypt_data(encrypted_data: str) -> str:
    return fernet.decrypt(encrypted_data.encode()).decode()
