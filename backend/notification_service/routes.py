from fastapi import APIRouter, Depends
from shared.mongo_db import MongoDBClient
from shared.security import get_current_user

router = APIRouter()

@router.get("/")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    db = MongoDBClient.get_db()
    cursor = db.notifications.find({"user_email": current_user["email"]}).sort("timestamp", -1).limit(50)
    notifications = await cursor.to_list(length=50)
    
    for notif in notifications:
        notif["_id"] = str(notif["_id"])
        
    return {"notifications": notifications}
