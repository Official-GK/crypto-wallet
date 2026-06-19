import pytest
import httpx
import asyncio
import json
import os
from redis.asyncio import Redis

BASE_URL = os.getenv("GATEWAY_URL", "http://localhost:8000")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.mark.asyncio
async def test_end_to_end_pipeline():
    redis = Redis.from_url(REDIS_URL, decode_responses=True)
    
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        # --- Step A: Registration & Login ---
        test_email = "tester_e2e@crypto.com"
        test_pass = "TestPass123!"
        
        # Clean up existing test data in redis if any
        await redis.delete(f"otp:{test_email}")
        await redis.delete(f"tx_otp:{test_email}")
        
        # Register
        await client.post("/auth/register", json={"email": test_email, "password": test_pass})
        
        # Trigger OTP
        await client.post(f"/auth/send-otp?email={test_email}")
        
        # Fetch OTP from Redis
        otp = await redis.get(f"otp:{test_email}")
        assert otp is not None, "Registration OTP not found in Redis"
        
        # Verify
        verify_res = await client.post("/auth/verify-otp", json={"email": test_email, "otp": otp})
        assert verify_res.status_code == 200
        
        # Login
        login_res = await client.post("/auth/login", json={"email": test_email, "password": test_pass})
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # --- Step B: Wallet Creation ---
        wallet_res = await client.post("/wallet/create", headers=headers, json={"asset_symbol": "ETH", "name": "Main"})
        assert wallet_res.status_code in [200, 201]
        from_address = wallet_res.json().get("public_address")
        assert from_address is not None
        
        # --- Step C: Transaction Flow ---
        tx_req = {
            "from_address": from_address,
            "to_address": "0x000000000000000000000000000000000000dEaD",
            "asset_symbol": "ETH",
            "amount": 0.01,
            "otp": ""
        }
        
        # Initial send asks for OTP
        send_res = await client.post("/transaction/send", json=tx_req, headers=headers)
        assert send_res.status_code == 200
        
        # Get TX OTP
        tx_otp = await redis.get(f"tx_otp:{test_email}")
        assert tx_otp is not None, "Transaction OTP not found in Redis"
        
        # Send again
        tx_req["otp"] = tx_otp
        send_res_2 = await client.post("/transaction/send", json=tx_req, headers=headers)
        assert send_res_2.status_code == 200
        
        print("\n✅ Asynchronous Pipeline Automated Test Passed Successfully!")
        
    await redis.close()
