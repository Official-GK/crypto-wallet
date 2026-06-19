import asyncio
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from backend.shared.database import AsyncSessionLocal
from backend.wallet_service.models import Wallet, Balance
from backend.transaction_service.models import Transaction

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Balance))
        balances = res.scalars().all()
        for b in balances:
            print(f"Wallet ID: {b.wallet_id}, Asset: {b.asset_symbol}, Amount: {b.amount}")

        res = await db.execute(select(Transaction))
        txs = res.scalars().all()
        print("\nTransactions:")
        for t in txs:
            print(f"TX {t.id}: {t.from_address} -> {t.to_address} | {t.amount} {t.asset_symbol} | {t.status}")

asyncio.run(main())
