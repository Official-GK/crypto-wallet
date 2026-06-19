import asyncio
import aio_pika
import json
import os
import uuid
from decimal import Decimal
from shared.mongo_db import MongoDBClient, log_security_event, log_notification
from shared.database import AsyncSessionLocal
from wallet_service.models import Wallet, Balance
from transaction_service.models import Transaction
from staking_service.models import Stake
from sqlalchemy.future import select

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")

# Connect to Mongo in Worker
MongoDBClient.connect()

async def process_fraud(message: aio_pika.IncomingMessage, channel: aio_pika.Channel):
    async with message.process():
        data = json.loads(message.body.decode())
        print(f"[FRAUD WORKER] Checking Transaction {data['tx_id']} (Value: ${data.get('usd_value', 0):.2f})")
        
        # Rule 1: Large Transaction
        usd_value = data.get("usd_value", 0)
        if usd_value > 1000000:
            print(f"[FRAUD WORKER] 🚨 FLAG! Transaction exceeds $1M threshold.")
            # Log to Mongo
            await log_security_event(
                user_email=data.get("user_email", "unknown"),
                event_type="fraud_flagged",
                details={"reason": "large_transaction", "tx_id": data["tx_id"], "usd_value": usd_value}
            )
            # Push to Notifications
            notif_msg = {
                "type": "fraud_alert",
                "user_email": data.get("user_email", "unknown"),
                "subject": "Action Required: Large Transaction Flagged",
                "body": f"Your transaction of {data['amount']} {data['asset_symbol']} is pending manual review."
            }
            await channel.default_exchange.publish(
                aio_pika.Message(body=json.dumps(notif_msg).encode()),
                routing_key="notification_queue"
            )
            # Mark transaction as flagged
            async with AsyncSessionLocal() as db:
                tx_res = await db.execute(select(Transaction).where(Transaction.id == data["tx_id"]))
                tx = tx_res.scalars().first()
                if tx:
                    tx.status = "declined"
                    await db.commit()
            return

        # Passed Fraud Checks - Send to Transaction Queue for Execution
        print(f"[FRAUD WORKER] Transaction {data['tx_id']} Passed Checks. Forwarding to Execution.")
        await channel.default_exchange.publish(
            aio_pika.Message(body=json.dumps(data).encode()),
            routing_key="transaction_queue"
        )

async def process_transaction(message: aio_pika.IncomingMessage, channel: aio_pika.Channel):
    async with message.process():
        data = json.loads(message.body.decode())
        tx_id = data["tx_id"]
        from_address = data["from_address"]
        to_address = data["to_address"]
        asset_symbol = data["asset_symbol"]
        amount = float(data["amount"])
        user_email = data.get("user_email", "unknown")

        print(f"[BLOCKCHAIN WORKER] Executing Transaction {tx_id}: {amount} {asset_symbol} from {from_address[:10]}... to {to_address[:10]}...")

        try:
            async with AsyncSessionLocal() as db:
                # 1. Fetch Transaction record
                tx_res = await db.execute(select(Transaction).where(Transaction.id == tx_id))
                tx_record = tx_res.scalars().first()
                if not tx_record:
                    print(f"[BLOCKCHAIN WORKER] ❌ Transaction {tx_id} not found in DB!")
                    return

                # 2. Fetch Sender Wallet and Balance
                sender_wallet_res = await db.execute(
                    select(Wallet).where(Wallet.public_address == from_address)
                )
                sender_wallet = sender_wallet_res.scalars().first()
                if not sender_wallet:
                    print(f"[BLOCKCHAIN WORKER] ❌ Sender wallet {from_address} not found!")
                    tx_record.status = "failed"
                    await db.commit()
                    return

                sender_bal_res = await db.execute(
                    select(Balance).where(
                        Balance.wallet_id == sender_wallet.id,
                        Balance.asset_symbol == asset_symbol
                    )
                )
                sender_bal = sender_bal_res.scalars().first()
                if not sender_bal or float(sender_bal.amount) < amount:
                    print(f"[BLOCKCHAIN WORKER] ❌ Insufficient balance for wallet {from_address}. Has: {float(sender_bal.amount) if sender_bal else 0}, Needs: {amount}")
                    tx_record.status = "failed"
                    await db.commit()
                    return

                # 3. Deduct from Sender
                sender_bal.amount = sender_bal.amount - Decimal(str(amount))
                print(f"[BLOCKCHAIN WORKER] ✅ Deducted {amount} {asset_symbol} from sender. New balance: {sender_bal.amount}")

                # 4. Credit to Receiver (if they have an internal wallet)
                receiver_wallet_res = await db.execute(
                    select(Wallet).where(Wallet.public_address == to_address)
                )
                receiver_wallet = receiver_wallet_res.scalars().first()
                if receiver_wallet:
                    rec_bal_res = await db.execute(
                        select(Balance).where(
                            Balance.wallet_id == receiver_wallet.id,
                            Balance.asset_symbol == asset_symbol
                        )
                    )
                    rec_bal = rec_bal_res.scalars().first()
                    if rec_bal:
                        rec_bal.amount = rec_bal.amount + Decimal(str(amount))
                    else:
                        new_b = Balance(wallet_id=receiver_wallet.id, asset_symbol=asset_symbol, amount=amount)
                        db.add(new_b)
                    print(f"[BLOCKCHAIN WORKER] ✅ Credited {amount} {asset_symbol} to receiver wallet.")
                else:
                    print(f"[BLOCKCHAIN WORKER] ℹ️ Receiver {to_address} is external — no internal credit.")

                # 5. Generate mock TX hash and mark as completed
                tx_hash = f"0x{uuid.uuid4().hex}{uuid.uuid4().hex[:16]}"
                tx_record.status = "completed"
                tx_record.tx_hash = tx_hash

                await db.commit()
                print(f"[BLOCKCHAIN WORKER] ✅ TX {tx_id} completed! Hash: {tx_hash}")

            # Push success notification
            notif_msg = {
                "type": "transaction_success",
                "user_email": user_email,
                "subject": "Transaction Sent Successfully",
                "body": f"Your transaction of {amount} {asset_symbol} has been confirmed. TX Hash: {tx_hash}"
            }
            await channel.default_exchange.publish(
                aio_pika.Message(body=json.dumps(notif_msg).encode()),
                routing_key="notification_queue"
            )

        except Exception as e:
            print(f"[BLOCKCHAIN WORKER] ❌ Error processing TX {tx_id}: {e}")
            import traceback
            traceback.print_exc()
            # Mark as failed on any unhandled error
            try:
                async with AsyncSessionLocal() as db:
                    tx_res = await db.execute(select(Transaction).where(Transaction.id == tx_id))
                    tx_record = tx_res.scalars().first()
                    if tx_record:
                        tx_record.status = "failed"
                        await db.commit()
            except Exception as db_e:
                print(f"[BLOCKCHAIN WORKER] DB Error updating failed status: {db_e}")

async def process_staking(message: aio_pika.IncomingMessage):
    async with message.process():
        data = json.loads(message.body.decode())
        try:
            async with AsyncSessionLocal() as db:
                # Fetch wallet for transaction logging
                wallet_res = await db.execute(select(Wallet).where(Wallet.id == data["wallet_id"]))
                wallet = wallet_res.scalars().first()
                if not wallet:
                    print(f"[STAKING WORKER] ❌ Wallet {data['wallet_id']} not found!")
                    return
                
                if data["action"] == "lock_balance":
                    bal_res = await db.execute(
                        select(Balance).where(
                            Balance.wallet_id == data["wallet_id"],
                            Balance.asset_symbol == data["asset_symbol"]
                        )
                    )
                    balance = bal_res.scalars().first()
                    amount = float(data["amount"])
                    
                    # Fetch the stake if stake_id provided
                    stake = None
                    if "stake_id" in data:
                        stake_res = await db.execute(select(Stake).where(Stake.id == data["stake_id"]))
                        stake = stake_res.scalars().first()
                    
                    if balance and float(balance.amount) >= amount:
                        balance.amount = balance.amount - Decimal(str(amount))
                        if stake:
                            stake.status = "active"
                            
                        # Create Transaction Record for Staking
                        tx = Transaction(
                            user_id=wallet.user_id,
                            from_address=wallet.public_address,
                            to_address="Staking Contract",
                            asset_symbol=data["asset_symbol"],
                            amount=amount,
                            status="completed",
                            tx_hash=f"0x{uuid.uuid4().hex}{uuid.uuid4().hex[:16]}"
                        )
                        db.add(tx)
                        
                        await db.commit()
                        print(f"[STAKING WORKER] ✅ Locked {amount} {data['asset_symbol']} for wallet {data['wallet_id']}")
                    else:
                        if stake:
                            stake.status = "failed"
                            await db.commit()
                        print(f"[STAKING WORKER] ❌ Insufficient balance to lock {amount} {data['asset_symbol']}")
                
                elif data["action"] == "unlock_balance":
                    bal_res = await db.execute(
                        select(Balance).where(
                            Balance.wallet_id == data["wallet_id"],
                            Balance.asset_symbol == data["asset_symbol"]
                        )
                    )
                    balance = bal_res.scalars().first()
                    total_credit = float(data["principal"]) + float(data["reward"])
                    if balance:
                        balance.amount = balance.amount + Decimal(str(total_credit))
                    else:
                        new_bal = Balance(
                            wallet_id=data["wallet_id"], 
                            asset_symbol=data["asset_symbol"], 
                            amount=total_credit
                        )
                        db.add(new_bal)
                        
                    # Create Transaction Record for Unstaking
                    tx = Transaction(
                        user_id=wallet.user_id,
                        from_address="Staking Contract",
                        to_address=wallet.public_address,
                        asset_symbol=data["asset_symbol"],
                        amount=total_credit,
                        status="completed",
                        tx_hash=f"0x{uuid.uuid4().hex}{uuid.uuid4().hex[:16]}"
                    )
                    db.add(tx)
                        
                    await db.commit()
                    print(f"[STAKING WORKER] ✅ Unlocked {data['principal']} {data['asset_symbol']} + {data['reward']} reward for wallet {data['wallet_id']}")
        except Exception as e:
            print(f"[STAKING WORKER] ❌ Error processing staking action {data['action']}: {e}")

async def process_notification(message: aio_pika.IncomingMessage):
    async with message.process():
        data = json.loads(message.body.decode())
        email = data.get("user_email")
        subject = data.get("subject")
        body = data.get("body")
        
        print(f"\n[NOTIFICATION WORKER] ✉️  Sending Email to {email}")
        print(f"Subject: {subject}")
        print(f"Body: {body}\n")
        
        # Save to MongoDB
        await log_notification(
            user_email=email,
            notification_type=data.get("type"),
            status="sent",
            content={"subject": subject, "body": body}
        )

async def main():
    print("[WORKER] Connecting to RabbitMQ...")
    connection = None
    for i in range(15):
        try:
            connection = await aio_pika.connect_robust(RABBITMQ_URL)
            break
        except Exception as e:
            print(f"[WORKER] RabbitMQ not ready yet (attempt {i+1}/15): {e}. Retrying in 2 seconds...")
            await asyncio.sleep(2)
            
    if not connection:
        print("[WORKER] Failed to connect to RabbitMQ after retries. Exiting.")
        return
        
    channel = await connection.channel()
    
    # Declare queues
    tx_queue = await channel.declare_queue("transaction_queue", durable=True)
    staking_queue = await channel.declare_queue("staking_queue", durable=True)
    fraud_queue = await channel.declare_queue("fraud_queue", durable=True)
    notif_queue = await channel.declare_queue("notification_queue", durable=True)
    
    # We pass the channel into handlers that need to publish further messages
    await fraud_queue.consume(lambda msg: process_fraud(msg, channel))
    await tx_queue.consume(lambda msg: process_transaction(msg, channel))
    await staking_queue.consume(process_staking)
    await notif_queue.consume(process_notification)
    
    print("[WORKER] ✅ Started listening for RabbitMQ messages...")
    await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
