import os

class Config:
    # Database Configs
    POSTGRES_USER = os.getenv("POSTGRES_USER", "user")
    POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "password")
    POSTGRES_DB = os.getenv("POSTGRES_DB", "crypto_db")
    POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
    POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
    
    POSTGRES_URL = f"postgresql+asyncpg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

    # MongoDB Config
    MONGO_HOST = os.getenv("MONGO_HOST", "mongodb")
    MONGO_PORT = os.getenv("MONGO_PORT", "27017")
    MONGO_DB = os.getenv("MONGO_DB", "cryptomongo")
    
    MONGO_URI = f"mongodb://{MONGO_HOST}:{MONGO_PORT}/"

    # Redis Config
    REDIS_HOST = os.getenv("REDIS_HOST", "redis")
    REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

    # Security
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "super-secret-key-change-me-in-production")
    JWT_ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = 30

settings = Config()
