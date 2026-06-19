@echo off
echo 🚀 Starting Crypto Dashboard Local Environment Setup...

echo 🧹 Cleaning up old containers and cached data...
docker-compose down -v
FOR /d /r . %%d in (__pycache__) DO @IF EXIST "%%d" rd /s /q "%%d"

echo 🐳 Building Docker images...
docker-compose build --no-cache

echo 🚢 Launching services...
docker-compose up -d

echo ⏳ Waiting 15 seconds for databases to initialize...
timeout /t 15 /nobreak

echo 🧪 Running Automated Integration Test Suite...
docker-compose exec api_gateway pytest tests/test_pipeline.py -v

echo ✅ Environment is fully deployed and verified!
echo ➡️ API Gateway is running at: http://localhost:8000
echo ➡️ RabbitMQ Dashboard is running at: http://localhost:15672
pause
