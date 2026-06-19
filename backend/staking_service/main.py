from fastapi import FastAPI
from staking_service.routes import router
from shared.database import engine, Base

app = FastAPI(title="Staking Service")

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

app.include_router(router, prefix="/staking", tags=["Staking"])

@app.get("/")
async def root():
    return {"message": "Staking service is running"}
