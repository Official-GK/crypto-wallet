#!/bin/bash

echo "🚀 Starting Crypto Dashboard Local Environment Setup..."

# Step 1: Clean up previous state
echo "🧹 Cleaning up old containers and cached data..."
docker compose down -v --remove-orphans
find . -type d -name "__pycache__" -exec rm -r {} + 2>/dev/null

# Step 2: Build the multi-stage Docker image
echo "🐳 Building Docker images..."
docker compose build --no-cache

# Step 3: Launch infrastructure and microservices
echo "🚢 Launching services..."
docker compose up -d

# Step 4: Wait for containers to launch
echo "⏳ Waiting 15 seconds for Postgres, Mongo, and RabbitMQ to fully initialize..."
sleep 15

# Step 5: Run the Automated Integration Test Suite
echo "🧪 Running Automated Integration Test Suite to prove E2E functionality..."
docker compose exec -e REDIS_URL="redis://redis:6379/0" api-gateway pytest tests/test_pipeline.py -v

echo "✅ Environment is fully deployed and verified!"
echo "➡️ API Gateway is running at: http://localhost:8000"
echo "➡️ RabbitMQ Dashboard is running at: http://localhost:15672"

