from fastapi import FastAPI
from transaction_service.routes import router
from shared.database import engine, Base

app = FastAPI(title="Transaction Service")

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

app.include_router(router, prefix="/transaction", tags=["Transaction"])

@app.get("/")
async def root():
    return {"message": "Transaction service is running"}
