import asyncio
from fastapi import FastAPI
from blockchain_service.routes import router
from blockchain_service.services import mock_polling_engine

app = FastAPI(title="Blockchain Service")

@app.on_event("startup")
async def startup_event():
    # Start the background polling task
    asyncio.create_task(mock_polling_engine())

app.include_router(router, prefix="/blockchain", tags=["Blockchain"])

@app.get("/")
async def root():
    return {"message": "Blockchain service is running"}
