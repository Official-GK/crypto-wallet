import asyncio
from fastapi import FastAPI
from market_service.routes import router
from market_service.services import update_market_prices_loop

app = FastAPI(title="Market Service")

@app.on_event("startup")
async def startup_event():
    # Start the background task for market data updates
    asyncio.create_task(update_market_prices_loop())

app.include_router(router, prefix="/market", tags=["Market"])

@app.get("/")
async def root():
    return {"message": "Market service is running"}
