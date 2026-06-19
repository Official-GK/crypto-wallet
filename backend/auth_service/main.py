from fastapi import FastAPI
from auth_service.routes import router
from shared.database import engine, Base

app = FastAPI(title="Auth Service")

@app.on_event("startup")
async def startup():
    # Create tables on startup (in production, use Alembic migrations instead)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

app.include_router(router, prefix="/auth", tags=["Auth"])

@app.get("/")
async def root():
    return {"message": "Auth service is running"}
