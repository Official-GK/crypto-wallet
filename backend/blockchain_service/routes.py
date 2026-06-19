from fastapi import APIRouter, Depends
from pydantic import BaseModel
from blockchain_service.services import mock_sign_transaction, mock_broadcast_transaction
from shared.security import get_current_user_id

router = APIRouter()

class SignRequest(BaseModel):
    from_address: str
    to_address: str
    amount: float
    asset_symbol: str

class BroadcastRequest(BaseModel):
    signed_payload: str

@router.post("/sign")
async def sign_tx(req: SignRequest, user_id: int = Depends(get_current_user_id)):
    signature = await mock_sign_transaction(req.model_dump())
    return {"signed_payload": signature}

@router.post("/broadcast")
async def broadcast_tx(req: BroadcastRequest, user_id: int = Depends(get_current_user_id)):
    tx_hash = await mock_broadcast_transaction(req.signed_payload)
    return {"tx_hash": tx_hash, "status": "broadcasted"}

@router.get("/status/{tx_hash}")
async def tx_status(tx_hash: str):
    import random
    # Randomly return confirming or confirmed
    status = random.choice(["confirming", "confirmed"])
    return {"tx_hash": tx_hash, "status": status}

@router.get("/node/status")
async def node_status():
    return {
        "status": "CONNECTED",
        "nodes": [
            "Ethereum Sepolia Testnet",
            "Polygon Amoy Testnet"
        ]
    }
