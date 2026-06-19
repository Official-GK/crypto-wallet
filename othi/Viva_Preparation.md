# FinSight Crypto Wallet - Viva Preparation Guide

This document is designed to help you prepare for your final project viva. It structures your presentation flow, provides a map of your codebase so you know exactly where every feature is located, and gives you a cheat sheet for technical "code questions".

---

## Part 1: Presentation Flow

### 1. Problem Statement
**What to say:**
"Traditional cryptocurrency wallets are often overly complex for new users, lack built-in robust fraud detection, and struggle with real-time UI synchronization without massive backend server loads. Furthermore, monolithic architectures in existing solutions make it difficult to independently scale specific components like background transaction processing or live market feeds."

### 2. Proposed Solution
**What to say:**
"I designed and implemented 'FinSight', a premium, highly responsive, non-custodial-style cryptocurrency wallet. It features a microservice-based backend architecture for infinite scalability, real-time caching on the frontend for a buttery-smooth user experience, and an asynchronous message-broker system (RabbitMQ) that runs dedicated security and fraud checks entirely in the background before any transaction is executed."

### 3. System Architecture
**What to say:**
- **High-Level Design:** Mention the **Client-Server Architecture** where a Vanilla JS/HTML Frontend communicates via REST API to a central **API Gateway**. The gateway routes traffic to 8 specialized microservices.
- **Low-Level Design:** Highlight the **Database Layer** (PostgreSQL for persistent financial data, Redis for high-speed caching and OTPs) and the **Event-Driven Asynchronous Layer** (RabbitMQ passing messages to dedicated Python workers for fraud detection and blockchain execution).

---

## Part 2: Codebase Walkthrough (What is Where?)

The panel will likely ask you to explain your code structure or show them where specific features are built. Use this guide to quickly navigate your project.

### 💻 The Frontend Code (Root Folder)
- **`index.html` & `auth.html`**: These files contain the raw HTML structure and custom CSS for the application's premium styling.
- **`dashboard.js`**: The brain of the frontend. It handles page navigation, draws the charts, manages the caching system, and listens for button clicks (like the "Confirm Transfer" button).
- **`api.js`**: The central network layer. Every time the frontend needs data, it calls functions here. This file automatically attaches your JWT security token to every request before sending it to the backend.
- **`auth.js`**: Handles user registration, login logic, and securely storing the JWT token in the browser's `localStorage`.

### ⚙️ The Backend Code (`backend/` Folder)
The backend is split into multiple independent microservices:
- **`api_gateway/`**: The "front door". It receives all requests from `api.js`, validates the JWT token, and routes the request to the correct microservice.
- **`wallet_service/`**: Handles creating new wallets and aggregating balances from the database.
- **`transaction_service/`**: Handles generating OTPs (saving them to Redis) and pushing new transaction requests into the RabbitMQ queue.
- **`worker/main.py`**: The asynchronous background processor. It continuously listens to the RabbitMQ queue, performs the $1M fraud check, and physically executes the database transfer.
- **`shared/models.py`**: The central database file. It defines your PostgreSQL SQL tables (Users, Wallets, Transactions) using SQLAlchemy.

### 🎯 Common Panel Requests: "Show me the code for..."
- **"Show me your Fraud Detection logic"**: Open `backend/worker/main.py`. Show them the `process_fraud_check` function where you check `if usd_value > 1000000:` and explicitly mark the status as `"declined"`.
- **"Show me where the frontend talks to the backend"**: Open `api.js`. Point to the `fetchWithAuth` function to prove you are securing every request by injecting the `Authorization: Bearer <token>` header.
- **"Show me how you calculate the Dashboard Stats"**: Open `dashboard.js`. Find the `dashboardStats()` function and show how you loop through the transactions, strictly checking `if (tx.status === 'completed')` before adding up the Total Sent and Total Received.
- **"Show me your database schemas"**: Open `backend/shared/models.py`. Point to the `Transaction` or `Wallet` classes to prove you understand relational SQL database design.
- **"Show me your OTP logic"**: Open `backend/transaction_service/services.py`. Show them `initiate_send_crypto` where the code checks if the OTP provided by the user matches the exact OTP saved in Redis before allowing the transaction to queue.

---

## Part 3: Technical Panel Questions & Answers

When the panel asks you *why* you wrote the code the way you did, here is exactly how to answer them confidently.

### Q1: "How did you handle the execution of transactions without freezing the user interface?"
**Your Answer:**
"I used an asynchronous event-driven architecture. When a user confirms a transaction, the `transaction_service` does not execute it immediately. Instead, it saves the status as *'pending'* and pushes a message payload into a **RabbitMQ queue**. A completely separate Python worker (`worker/main.py`) continuously listens to this queue, performs security checks in the background, and updates the database. The frontend simply polls the database for a few seconds to get the final status, ensuring the UI remains perfectly smooth."

### Q2: "How did you implement fraud detection?"
**Your Answer:**
"Fraud detection happens in the background worker. Before a transaction is sent to the blockchain queue, the worker intercepts it from the `fraud_queue`. It checks rules—for example, if the transaction exceeds a USD threshold (like $1,000,000)—it immediately marks the transaction status as `declined` in the PostgreSQL database and safely drops the request. This prevents malicious actors from draining accounts."

### Q3: "I see you used Vanilla JavaScript instead of React. How do you handle UI state and data fetching?"
**Your Answer:**
"I built a custom lightweight caching layer (`Cache` object in `dashboard.js`). Instead of hitting the backend database every time a user switches tabs, functions like `API.getTransactions()` first check if the data is already in memory. When a user makes a change (like sending crypto), I call an `API.invalidate(...)` function, which forces the cache to clear and pulls fresh data from the server, instantly syncing the UI cards and charts."

### Q4: "How do you ensure mathematical accuracy for cryptocurrency balances?"
**Your Answer:**
"Financial applications cannot rely on standard `float` data types because they suffer from binary precision errors (e.g., `0.1 + 0.2 = 0.300000000004`). In my Python backend, I strictly used the `Decimal` module for all transaction math, and mapped it to the `Numeric` type in PostgreSQL. This guarantees exact precision down to 6 or 8 decimal places for coins like Bitcoin."

### Q5: "How is user security and authentication managed?"
**Your Answer:**
"I implemented **JWT (JSON Web Tokens)**. When a user logs in, the `auth_service` verifies their password hash and issues a JWT token. The frontend stores this token and attaches it to the HTTP Authorization header for every request. My FastAPI backend uses `Depends(get_current_user)` to decode the token at the **API Gateway** level, guaranteeing that a user can only query or move funds belonging to their specific User ID."

### Q6: "Why did you choose a Microservices architecture over a Monolith?"
**Your Answer:**
"Microservices provide independent scalability and fault isolation. For example, if the `market_service` crashes because the external price API goes down, users can still log in and view their wallet balances through the `wallet_service`. Additionally, if transaction volume spikes, I can dynamically spin up more RabbitMQ `worker-main` Docker containers to handle the queue without needing to duplicate the entire application database or web server."

### Q7: "How did you secure the transaction transfer process (OTP)?"
**Your Answer:**
"To prevent unauthorized transfers, I implemented a Two-Factor Authentication (OTP) flow using **Redis**. When a user initiates a transfer, a secure 6-digit code is generated, hashed, and stored in Redis with a strict 10-minute expiration timer (TTL). The transaction is completely blocked from entering the RabbitMQ queue until the user submits the matching OTP."
