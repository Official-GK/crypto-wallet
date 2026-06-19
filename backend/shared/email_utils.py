import os
import smtplib
from email.message import EmailMessage
import asyncio

SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))

def _send_email_sync(to_email: str, subject: str, body: str):
    """Synchronous core logic to send email using smtplib"""
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        print(f"\n[WARNING] SMTP credentials not configured. Mock sending email to {to_email}")
        print(f"Subject: {subject}\nBody: {body}\n")
        return False
        
    msg = EmailMessage()
    msg.set_content(body)
    msg["Subject"] = subject
    msg["From"] = f"CryptoVault <{SMTP_EMAIL}>"
    msg["To"] = to_email

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        print(f"[INFO] Successfully sent OTP email to {to_email}")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to send email to {to_email}: {e}")
        return False

async def send_otp_email(to_email: str, subject: str, body: str):
    """
    Asynchronously send an email without blocking the FastAPI event loop.
    Uses asyncio.to_thread to offload the synchronous smtplib call.
    """
    return await asyncio.to_thread(_send_email_sync, to_email, subject, body)
