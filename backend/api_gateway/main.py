from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from fastapi.responses import JSONResponse, Response
import os

from api_gateway.middleware import rate_limit_middleware

app = FastAPI(title="Crypto Dashboard API Gateway")

from starlette.middleware.base import BaseHTTPMiddleware

app.add_middleware(BaseHTTPMiddleware, dispatch=rate_limit_middleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"[GATEWAY ERROR] {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": True, "message": "An internal server error occurred."}
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": True, "message": str(exc.detail)}
    )

AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://auth-service:8001")
WALLET_SERVICE_URL = os.getenv("WALLET_SERVICE_URL", "http://wallet-service:8002")
TRANSACTION_SERVICE_URL = os.getenv("TRANSACTION_SERVICE_URL", "http://transaction-service:8003")
MARKET_SERVICE_URL = os.getenv("MARKET_SERVICE_URL", "http://market-service:8004")
STAKING_SERVICE_URL = os.getenv("STAKING_SERVICE_URL", "http://staking-service:8005")
BLOCKCHAIN_SERVICE_URL = os.getenv("BLOCKCHAIN_SERVICE_URL", "http://blockchain-service:8006")
SECURITY_SERVICE_URL = os.getenv("SECURITY_SERVICE_URL", "http://security-service:8007")
FRAUD_SERVICE_URL = os.getenv("FRAUD_SERVICE_URL", "http://fraud-service:8008")
NOTIFICATION_SERVICE_URL = os.getenv("NOTIFICATION_SERVICE_URL", "http://notification-service:8009")

@app.get("/")
async def root():
    return {"message": "API Gateway is running"}

async def proxy_request(service_url: str, path: str, request: Request):
    url = f"{service_url}/{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        body = await request.body()
        headers = dict(request.headers)
        headers.pop("host", None)
        try:
            response = await client.request(
                method=request.method,
                url=url,
                headers=headers,
                content=body,
                params=request.query_params
            )
            excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
            res_headers = {k: v for k, v in response.headers.items() if k.lower() not in excluded_headers}
            return Response(content=response.content, status_code=response.status_code, headers=res_headers)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=503, detail=f"Service unavailable: {str(exc)}")

@app.api_route("/auth/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_auth(path: str, request: Request):
    return await proxy_request(f"{AUTH_SERVICE_URL}/auth", path, request)

@app.api_route("/admin/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_admin(path: str, request: Request):
    # Route unrestricted admin endpoints (like faucet) directly to wallet service for now
    return await proxy_request(f"{WALLET_SERVICE_URL}/wallet/admin", path, request)

@app.api_route("/wallet/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_wallet(path: str, request: Request):
    return await proxy_request(f"{WALLET_SERVICE_URL}/wallet", path, request)

@app.api_route("/transaction/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_transaction(path: str, request: Request):
    return await proxy_request(f"{TRANSACTION_SERVICE_URL}/transaction", path, request)

@app.api_route("/market/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_market(path: str, request: Request):
    return await proxy_request(f"{MARKET_SERVICE_URL}/market", path, request)

@app.api_route("/staking/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_staking(path: str, request: Request):
    return await proxy_request(f"{STAKING_SERVICE_URL}/staking", path, request)

@app.api_route("/blockchain/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_blockchain(path: str, request: Request):
    return await proxy_request(f"{BLOCKCHAIN_SERVICE_URL}/blockchain", path, request)

@app.api_route("/security/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_security(path: str, request: Request):
    return await proxy_request(f"{SECURITY_SERVICE_URL}/security", path, request)

@app.api_route("/fraud/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_fraud(path: str, request: Request):
    return await proxy_request(f"{FRAUD_SERVICE_URL}/fraud", path, request)

@app.api_route("/notifications/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_notifications(path: str, request: Request):
    return await proxy_request(f"{NOTIFICATION_SERVICE_URL}/notifications", path, request)
