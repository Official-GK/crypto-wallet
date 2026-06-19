from fastapi import FastAPI
from security_service.routes import router
from shared.mongo_db import MongoDBClient

app = FastAPI(title="Security Service")

@app.on_event("startup")
async def startup_event():
    MongoDBClient.connect()

app.include_router(router, prefix="/security", tags=["Security"])

@app.get("/")
async def root():
    return {"message": "Security service is running"}
