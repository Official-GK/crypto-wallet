from motor.motor_asyncio import AsyncIOMotorClient
from shared.config import settings
from datetime import datetime

class MongoDBClient:
    client: AsyncIOMotorClient = None
    db = None

    @classmethod
    def connect(cls):
        cls.client = AsyncIOMotorClient(settings.MONGO_URI)
        cls.db = cls.client[settings.MONGO_DB]
        print(f"[MONGODB] Connected to database: {settings.MONGO_DB}")

    @classmethod
    def get_db(cls):
        if cls.db is None:
            cls.connect()
        return cls.db

async def log_audit(action: str, details: dict):
    db = MongoDBClient.get_db()
    await db.audit_logs.insert_one({
        "action": action,
        "details": details,
        "timestamp": datetime.utcnow()
    })

async def log_security_event(user_email: str, event_type: str, details: dict):
    db = MongoDBClient.get_db()
    await db.security_logs.insert_one({
        "user_email": user_email,
        "event_type": event_type,
        "details": details,
        "timestamp": datetime.utcnow()
    })

async def log_notification(user_email: str, notification_type: str, status: str, content: dict):
    db = MongoDBClient.get_db()
    await db.notifications.insert_one({
        "user_email": user_email,
        "type": notification_type,
        "status": status,
        "content": content,
        "timestamp": datetime.utcnow()
    })
