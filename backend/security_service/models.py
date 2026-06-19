from pydantic import BaseModel
from typing import Optional

class DeviceVerificationRequest(BaseModel):
    user_email: str
    ip_address: str
    user_agent: str

class MFAUpdateRequest(BaseModel):
    mfa_type: str # "email" or "totp"
    totp_secret: Optional[str] = None
