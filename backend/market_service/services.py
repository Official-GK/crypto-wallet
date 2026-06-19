import asyncio
import json
import random
from shared.cache import get_redis

MOCK_ASSETS = ["BTC", "ETH", "SOL", "USDT", "ADA", "XRP", "DOT"]

async def update_market_prices_loop():
    redis = await get_redis()
    while True:
        # Mock price generation
        prices = {}
        for asset in MOCK_ASSETS:
            # Base price mock
            base = {"BTC": 60000, "ETH": 3000, "SOL": 150, "USDT": 1.0, "ADA": 0.5, "XRP": 0.6, "DOT": 7.0}.get(asset, 100)
            # Add random fluctuation +/- 2%
            fluctuation = base * random.uniform(-0.02, 0.02)
            prices[asset] = {
                "price": round(base + fluctuation, 2),
                "change_24h": round(random.uniform(-5.0, 5.0), 2)
            }
            
        await redis.set("market_prices", json.dumps(prices))
        await asyncio.sleep(30) # Update every 30 seconds

async def get_current_prices():
    redis = await get_redis()
    data = await redis.get("market_prices")
    if data:
        return json.loads(data)
    return {}

async def get_top_gainers_losers():
    prices = await get_current_prices()
    if not prices:
        return {"gainers": [], "losers": []}
        
    sorted_assets = sorted(prices.items(), key=lambda item: item[1]["change_24h"], reverse=True)
    
    return {
        "gainers": [{"asset": k, **v} for k, v in sorted_assets[:3]],
        "losers": [{"asset": k, **v} for k, v in sorted_assets[-3:]]
    }
