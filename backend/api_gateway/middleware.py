from fastapi import Request
from shared.cache import get_redis

RATE_LIMIT = 600 # 600 requests
RATE_LIMIT_TTL = 60 # per 60 seconds

async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host
    redis = await get_redis()
    
    key = f"rate_limit:{client_ip}"
    current_count = await redis.incr(key)
    
    if current_count == 1:
        await redis.expire(key, RATE_LIMIT_TTL)
        
    if current_count > RATE_LIMIT:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=429,
            content={"error": True, "message": "Too Many Requests. Rate limit exceeded."}
        )
        
    response = await call_next(request)
    return response
