FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc g++ libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy all requirements files first to leverage Docker cache
COPY ./api_gateway/requirements.txt ./api_gateway/
COPY ./auth_service/requirements.txt ./auth_service/
COPY ./wallet_service/requirements.txt ./wallet_service/
COPY ./transaction_service/requirements.txt ./transaction_service/
COPY ./market_service/requirements.txt ./market_service/
COPY ./staking_service/requirements.txt ./staking_service/
COPY ./blockchain_service/requirements.txt ./blockchain_service/
COPY ./security_service/requirements.txt ./security_service/
COPY ./fraud_service/requirements.txt ./fraud_service/
COPY ./notification_service/requirements.txt ./notification_service/
COPY ./worker/requirements.txt ./worker/

# Combine and install all requirements to create a unified base image
RUN cat */requirements.txt | sort -u > combined_requirements.txt && \
    pip install --no-cache-dir -r combined_requirements.txt

COPY . .

CMD ["uvicorn", "api_gateway.main:app", "--host", "0.0.0.0", "--port", "8000"]
