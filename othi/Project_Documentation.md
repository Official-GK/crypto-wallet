# CryptoVault - Project Documentation

## 1. Problem Statement
With the widespread adoption of digital assets, users require a unified, secure, and reliable platform to manage their cryptocurrency portfolios. Existing solutions often suffer from poor user experiences, lack of multi-chain support, inadequate security features, or monolithic architectures that fail to scale under high transaction loads. There is a pressing need for a highly scalable, non-custodial cryptocurrency wallet that effortlessly handles secure transactions, staking, and real-time market data without compromising on security.

## 2. Proposed Solution
**CryptoVault** is a next-generation cryptocurrency wallet system designed using a highly distributed microservices architecture. It provides a secure, fast, and feature-rich platform that allows users to seamlessly send, receive, store, and stake digital assets across multiple blockchains. The system enforces stringent security measures, including Email OTP verification, JWT-based authentication, end-to-end encryption, and a dedicated Fraud Detection engine, ensuring user assets remain protected at all times.

## 3. System Architecture
The CryptoVault system relies on an API Gateway as the single entry point, orchestrating requests to 8 dedicated Python FastAPI microservices. Asynchronous tasks (like blockchain broadcasting and email notifications) are handled by a RabbitMQ message broker.
- **Frontend Layer:** Communicates with the API Gateway via REST.
- **Microservices Layer:** Python FastAPI services running inside isolated Docker containers.
- **Message Broker:** RabbitMQ handles queues like `transaction_queue` and `fraud_queue`.
- **Data Layer:** PostgreSQL (Primary DB), Redis (Session & Caching), MongoDB (Logs & Documents).
- **Deployment:** The entire infrastructure is orchestrated via Docker Compose.

## 4. Module Description
The system is cleanly decoupled into the following modules:
1. **Auth Service:** Handles user registration, JWT token generation, and Email OTP verification.
2. **Wallet Service:** Creates crypto wallets, securely generates addresses, and tracks aggregate balances.
3. **Transaction Service:** Manages crypto transfers, estimates network fees, and tracks transaction history.
4. **Market Service:** Aggregates real-time price feeds, top gainers/losers, and analytical charts.
5. **Staking Service:** Manages staking portfolios, calculates APY yields, and runs the rewards engine.
6. **Blockchain Service:** Validates, broadcasts, and confirms on-chain transactions across networks (Bitcoin, Ethereum, Solana, etc.).
7. **Fraud Service:** A specialized risk-scoring engine that flags suspicious activities and blocks malicious transactions.
8. **Notification Service:** Dispatches transactional alerts, security warnings, and OTPs via Email.

## 5. Database Design
The system utilizes a polyglot persistence strategy:
- **PostgreSQL (Relational):** Stores structured entities.
  - `Users` (id, email, hashed_password)
  - `Wallets` (id, user_id, public_address, encrypted_key)
  - `Balances` (id, wallet_id, asset_symbol, amount)
  - `Transactions` (id, user_id, from/to address, amount, status)
  - `Stakes` & `Rewards` (for yield farming mechanics)
- **Redis (Key-Value):** High-speed caching for active sessions, live crypto market prices, and rate-limiting counters.
- **MongoDB (Document):** Flexible schema for storing verbose Audit Logs, Security Logs, and raw Blockchain confirmation receipts.

## 6. Technology Stack
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6), Chart.js
- **Backend:** Python 3.10+, FastAPI, Uvicorn, SQLAlchemy, Pydantic
- **Databases:** PostgreSQL, Redis, MongoDB
- **Messaging Queue:** RabbitMQ
- **Authentication:** JWT (Access + Refresh Tokens), Email OTP
- **Deployment:** Docker, Docker Compose
- **Monitoring:** Prometheus, Grafana

## 7. Implementation Details
The backend is implemented using **FastAPI**, capitalizing on Python's async capabilities to deliver extremely low-latency API responses. All API payloads are strictly validated using **Pydantic** models before hitting the business logic layer. The database interactions are abstracted using **SQLAlchemy ORM**, which securely maps Python objects to the PostgreSQL tables.

To ensure non-blocking execution, heavy tasks like talking to blockchain nodes or calculating fraud scores are offloaded to **RabbitMQ**. A dedicated Python worker process constantly listens to these queues and executes the background jobs.

## 8. Screenshots
*(Please export this document to PDF after inserting screenshots of your UI below)*

### Dashboard View
`[Insert Screenshot of Dashboard Here]`

### Wallet Management
`[Insert Screenshot of Wallets Page Here]`

### Transaction & Staking Interfaces
`[Insert Screenshot of Staking Page Here]`

## 9. Future Scope
- **Mobile Application:** Developing native iOS and Android applications utilizing React Native or Swift/Kotlin to expand user accessibility.
- **Hardware Wallet Integration:** Allowing users to connect physical hardware wallets (like Ledger or Trezor) for enhanced security during large transactions.
- **DeFi Swapping:** Introducing an internal Decentralized Exchange (DEX) aggregator to let users swap tokens directly within the vault.
- **Advanced AI Fraud Detection:** Upgrading the rule-based Fraud Service to a Machine Learning model that dynamically learns from new transaction patterns.
