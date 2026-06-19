import asyncio
import os
import json
from shared.web3_client import Web3ClientManager
from shared.database import AsyncSessionLocal
from wallet_service.models import Wallet, Balance
from shared.mongo_db import MongoDBClient, log_audit
from sqlalchemy.future import select
import aio_pika

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")

async def poll_new_blocks():
    w3 = Web3ClientManager.get_sepolia_client()
    
    # Initialize connection to Mongo
    MongoDBClient.connect()
    
    connection = None
    for i in range(15):
        try:
            connection = await aio_pika.connect_robust(RABBITMQ_URL)
            break
        except Exception as e:
            print(f"[BLOCK LISTENER] RabbitMQ not ready yet (attempt {i+1}/15): {e}. Retrying in 2 seconds...")
            await asyncio.sleep(2)
            
    if not connection:
        print("[BLOCK LISTENER] Failed to connect to RabbitMQ after retries. Exiting.")
        return
        
    channel = await connection.channel()
    
    print("[BLOCK LISTENER] Starting live Sepolia block polling...")
    
    try:
        latest_block_num = await w3.eth.block_number
    except Exception as e:
        print(f"[BLOCK LISTENER] Could not connect to Web3: {e}")
        return
        
    while True:
        try:
            current_block_num = await w3.eth.block_number
            if current_block_num > latest_block_num:
                for block_num in range(latest_block_num + 1, current_block_num + 1):
                    block = await w3.eth.get_block(block_num, full_transactions=True)
                    print(f"[BLOCK LISTENER] Scanning Block {block_num} with {len(block.transactions)} txs")
                    
                    # Fetch all user public addresses from Postgres
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(select(Wallet.public_address, Wallet.user_id, Wallet.id))
                        wallets = result.all()
                        wallet_map = {w.public_address.lower(): w for w in wallets}
                    
                    for tx in block.transactions:
                        to_address = tx.get('to')
                        if to_address and to_address.lower() in wallet_map:
                            val_ether = float(w3.from_wei(tx.value, 'ether'))
                            print(f"🚨 [BLOCK LISTENER] MATCH FOUND! 🚨 {val_ether} ETH deposited to {to_address}")
                            
                            wallet_record = wallet_map[to_address.lower()]
                            
                            # 1. Update Balance in DB
                            async with AsyncSessionLocal() as db:
                                b_result = await db.execute(select(Balance).where(Balance.wallet_id == wallet_record.id, Balance.asset_symbol == "ETH"))
                                balance_record = b_result.scalars().first()
                                if balance_record:
                                    balance_record.amount = float(balance_record.amount) + val_ether
                                else:
                                    new_b = Balance(wallet_id=wallet_record.id, asset_symbol="ETH", amount=val_ether)
                                    db.add(new_b)
                                await db.commit()
                            
                            # 2. Log to Mongo
                            await log_audit("blockchain_deposit", {
                                "tx_hash": tx.hash.hex(),
                                "to": to_address,
                                "amount": val_ether,
                                "asset": "ETH"
                            })
                            
                            # 3. Alert Notification Queue
                            notif_msg = {
                                "type": "deposit_received",
                                "user_email": "user@example.com", # In real app, join User table to get email
                                "subject": "Deposit Received!",
                                "body": f"You just received {val_ether} ETH! TxHash: {tx.hash.hex()}"
                            }
                            await channel.default_exchange.publish(
                                aio_pika.Message(body=json.dumps(notif_msg).encode()),
                                routing_key="notification_queue"
                            )
                            
                latest_block_num = current_block_num
                
            await asyncio.sleep(12) # ~12s block time on Ethereum
            
        except Exception as e:
            print(f"[BLOCK LISTENER] Error: {e}")
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(poll_new_blocks())
