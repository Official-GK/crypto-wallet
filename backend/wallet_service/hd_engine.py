from eth_account import Account
import os
from shared.security import encrypt_data

Account.enable_unaudited_hdwallet_features()

MASTER_SEED_PHRASE = os.getenv("MASTER_SEED_PHRASE", "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about")

def derive_evm_address(user_id: int, wallet_index: int = 0):
    """
    Derives an EVM address and private key using standard BIP-44 path for Ethereum.
    Path: m/44'/60'/user_id'/0/wallet_index
    """
    path = f"m/44'/60'/{user_id}'/0/{wallet_index}"
    
    account = Account.from_mnemonic(MASTER_SEED_PHRASE, account_path=path)
    
    return {
        "address": account.address,
        "encrypted_key": encrypt_data(account.key.hex())
    }
