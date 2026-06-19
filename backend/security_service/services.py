import uuid
from shared.mongo_db import log_security_event, log_audit
from shared.security import encrypt_data

async def verify_device_login(user_email: str, ip_address: str, user_agent: str) -> dict:
    is_new_device = False
    
    # Simulate risk: 10% chance it's a new unrecognized device
    import random
    if random.random() < 0.1:
        is_new_device = True
        
    await log_security_event(
        user_email=user_email,
        event_type="device_login",
        details={
            "ip_address": ip_address,
            "user_agent": user_agent,
            "is_new_device": is_new_device
        }
    )
    
    if is_new_device:
        return {"status": "flagged", "message": "New device detected. Additional verification may be required."}
    
    return {"status": "verified", "message": "Device recognized."}

async def update_user_mfa(user_email: str, mfa_type: str, totp_secret: str = None) -> dict:
    details = {"mfa_type": mfa_type}
    
    if mfa_type == "totp" and totp_secret:
        # Encrypt the secret before storing it (mock DB update)
        encrypted_secret = encrypt_data(totp_secret)
        details["encrypted_totp_secret"] = encrypted_secret
        # Here we would update the PostgreSQL User record with the encrypted_secret
        
    await log_audit("mfa_updated", {"user_email": user_email, **details})
    
    return {"message": f"MFA updated to {mfa_type} successfully"}
