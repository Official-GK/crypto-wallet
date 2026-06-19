from fastapi import FastAPI
from notification_service.routes import router
from shared.mongo_db import MongoDBClient

app = FastAPI(title="Notification Service")

@app.on_event("startup")
async def startup_event():
    MongoDBClient.connect()

app.include_router(router, prefix="/notifications", tags=["Notifications"])

@app.get("/")
async def root():
    return {"message": "Notification service is running"}
