# CryptoVault

**GitHub Repository:** `[Insert GitHub Link Here]`

## Project Overview
CryptoVault is a secure, scalable, and reliable cryptocurrency wallet platform designed to allow users to buy, send, receive, store, stake, and manage digital assets. It utilizes a highly distributed microservices architecture to ensure fault tolerance, scalability, and robust security. 

## Dependencies
The system relies on the following core technologies:
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6), Chart.js
- **Backend Framework:** Python 3.10+, FastAPI, Uvicorn
- **Data & ORM:** SQLAlchemy, Pydantic
- **Databases:** PostgreSQL (Primary), Redis (Cache), MongoDB (Logs/Documents)
- **Message Broker:** RabbitMQ
- **Deployment & Containerization:** Docker, Docker Compose

## Setup Instructions
To set up the project locally, ensure you have Docker and Docker Compose installed on your system.

1. **Clone the repository:**
   ```bash
   git clone [Insert GitHub Link Here]
   cd CryptoVault
   ```
2. **Environment Variables:**
   Ensure the `.env` file is present in the `backend/` directory with necessary credentials (like `SMTP_EMAIL`, `SMTP_PASSWORD`).

3. **Build the Docker Containers:**
   Navigate into the backend directory and run the build command:
   ```bash
   cd backend
   docker-compose build
   ```

## Execution Steps
1. **Start the Infrastructure:**
   Run the following command to spin up PostgreSQL, Redis, MongoDB, RabbitMQ, and all 8 Python FastAPI microservices simultaneously.
   ```bash
   docker-compose up -d
   ```
2. **Verify Services:**
   Check the Docker logs or use Docker Desktop to ensure the `api-gateway`, `auth-service`, `wallet-service`, and databases are all showing `Healthy`.

3. **Launch the Frontend:**
   Simply open the `index.html` file in your preferred web browser. The frontend interacts directly with the `api-gateway` running on `localhost:8000`.

## Additional Project Details
### Microservices Architecture
The backend is split into independently scalable services:
- **Auth Service:** Registration, Login, OTP verification, JWT management.
- **Wallet Service:** Creates crypto wallets, generates addresses, manages balances.
- **Transaction Service:** Facilitates sending and receiving crypto.
- **Staking Service:** Handles APY calculations and rewards distribution.
- **Market Service:** Fetches live prices and charts.
- **Notification Service:** Dispatches emails and alerts via RabbitMQ.
- **Blockchain Service:** Validates, broadcasts, and tracks on-chain transactions.
- **Fraud Service:** Analyzes risk scoring and detects suspicious activity in real-time.

### Security Highlights
- Password hashing via **bcrypt**
- End-to-end encryption for private keys
- **JWT Authentication** combined with **Email OTP Verification** for sensitive actions.
