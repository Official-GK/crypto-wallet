from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from motor.motor_asyncio import AsyncIOMotorClient
from shared.config import settings

# --- PostgreSQL Setup ---
engine = create_async_engine(settings.POSTGRES_URL, echo=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

# --- MongoDB Setup ---
motor_client = AsyncIOMotorClient(settings.MONGO_URI)
mongo_db = motor_client[settings.MONGO_DB]

def get_mongo_db():
    return mongo_db
