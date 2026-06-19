from fastapi import APIRouter
from market_service.services import get_current_prices, get_top_gainers_losers

router = APIRouter()

@router.get("/prices")
async def fetch_prices():
    prices = await get_current_prices()
    return {"prices": prices}

@router.get("/top-gainers")
async def fetch_gainers():
    data = await get_top_gainers_losers()
    return {"gainers": data["gainers"]}

@router.get("/top-losers")
async def fetch_losers():
    data = await get_top_gainers_losers()
    return {"losers": data["losers"]}
