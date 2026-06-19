from fastapi import FastAPI
from fraud_service.routes import router
from shared.mongo_db import MongoDBClient

app = FastAPI(title="Fraud Detection Service")

@app.on_event("startup")
async def startup_event():
    MongoDBClient.connect()

app.include_router(router, prefix="/fraud", tags=["Fraud"])

@app.get("/")
async def root():
    return {"message": "Fraud service is running"}
