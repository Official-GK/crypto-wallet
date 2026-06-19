from fastapi import APIRouter, Depends, Request
from security_service.models import DeviceVerificationRequest, MFAUpdateRequest
from security_service.services import verify_device_login, update_user_mfa
from shared.security import get_current_user

router = APIRouter()

@router.post("/verify-device")
async def verify_device(req: DeviceVerificationRequest):
    return await verify_device_login(req.user_email, req.ip_address, req.user_agent)

@router.post("/update-mfa")
async def update_mfa(req: MFAUpdateRequest, current_user: dict = Depends(get_current_user)):
    return await update_user_mfa(current_user["email"], req.mfa_type, req.totp_secret)
