import os
from web3 import AsyncWeb3, AsyncHTTPProvider

SEPOLIA_RPC_URL = os.getenv("SEPOLIA_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com")
AMOY_RPC_URL = os.getenv("AMOY_RPC_URL", "https://rpc-amoy.polygon.technology")

class Web3ClientManager:
    _sepolia_w3 = None
    _amoy_w3 = None

    @classmethod
    def get_sepolia_client(cls) -> AsyncWeb3:
        if cls._sepolia_w3 is None:
            cls._sepolia_w3 = AsyncWeb3(AsyncHTTPProvider(SEPOLIA_RPC_URL, request_kwargs={'timeout': 30}))
        return cls._sepolia_w3

    @classmethod
    def get_amoy_client(cls) -> AsyncWeb3:
        if cls._amoy_w3 is None:
            cls._amoy_w3 = AsyncWeb3(AsyncHTTPProvider(AMOY_RPC_URL, request_kwargs={'timeout': 30}))
        return cls._amoy_w3

    @classmethod
    def get_client(cls, asset_symbol: str) -> AsyncWeb3:
        if asset_symbol.upper() == "ETH":
            return cls.get_sepolia_client()
        elif asset_symbol.upper() in ["MATIC", "POL"]:
            return cls.get_amoy_client()
        else:
            return cls.get_sepolia_client() # default fallback
