from fastapi import APIRouter, Depends, HTTPException
from shared.mongo_db import MongoDBClient
from shared.security import get_current_user

router = APIRouter()

@router.get("/alerts")
async def get_fraud_alerts(current_user: dict = Depends(get_current_user)):
    db = MongoDBClient.get_db()
    # Fetch security logs where event type contains 'fraud' or 'flagged'
    cursor = db.security_logs.find({
        "user_email": current_user["email"],
        "event_type": {"$regex": "fraud|flagged", "$options": "i"}
    }).sort("timestamp", -1).limit(50)
    
    alerts = await cursor.to_list(length=50)
    
    # Convert ObjectId to string for JSON serialization
    for alert in alerts:
        alert["_id"] = str(alert["_id"])
        
    return {"alerts": alerts}
