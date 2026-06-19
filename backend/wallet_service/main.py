from fastapi import FastAPI
from wallet_service.routes import router
from shared.database import engine, Base

app = FastAPI(title="Wallet Service")

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

app.include_router(router, prefix="/wallet", tags=["Wallet"])

@app.get("/")
async def root():
    return {"message": "Wallet service is running"}
