/**
 * api.js — Core networking layer for CryptoVault
 * Bridges the HTML/CSS/JS frontend with FastAPI microservices.
 * Zero mock data. Every function hits a real backend route.
 */

'use strict';

// ==========================================
// 1. GLOBAL CONFIG & AUTH STATE
// ==========================================

const API_BASE_URL = 'http://localhost:8000';

const AuthState = {
    setToken(token)   { localStorage.setItem('jwt_token', token); },
    getToken()        { return localStorage.getItem('jwt_token'); },
    clearToken()      { localStorage.removeItem('jwt_token'); },
    isAuthenticated() { return !!this.getToken(); }
};

/**
 * Core fetch wrapper — injects Authorization header, handles 401 globally.
 */
async function fetchWithAuth(endpoint, options = {}) {
    const token = AuthState.getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

        if (response.status === 401) {
            AuthState.clearToken();
            window.location.href = 'auth.html';
            throw new Error('Session expired.');
        }

        let data = null;
        try { data = await response.json(); } catch (_) { /* no body */ }

        if (!response.ok) {
            throw { status: response.status, data: data || { message: response.statusText } };
        }
        return data;

    } catch (err) {
        if (err.status !== undefined) throw err;
        console.error(`[api.js] Network error on ${endpoint}:`, err);
        throw { status: 0, data: { message: 'Network error — is the backend running?' } };
    }
}

// ==========================================
// 2. AUTH ENDPOINTS
// ==========================================

async function registerUser(data) {
    return fetchWithAuth('/auth/register', { method: 'POST', body: JSON.stringify(data) });
}

async function sendOtp(email) {
    return fetchWithAuth(`/auth/send-otp?email=${encodeURIComponent(email)}`, { method: 'POST' });
}

async function verifyOtp(data) {
    return fetchWithAuth('/auth/verify-otp', { method: 'POST', body: JSON.stringify(data) });
}

async function loginUser(credentials) {
    const data = await fetchWithAuth('/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
    if (data?.access_token) {
        AuthState.setToken(data.access_token);
        window.location.href = 'index.html';
    }
    return data;
}

function logoutUser() {
    AuthState.clearToken();
    window.location.href = 'auth.html';
}

async function fetchUserProfile() {
    return fetchWithAuth('/auth/me', { method: 'GET' });
}

// ==========================================
// 3. WALLET ENDPOINTS
// ==========================================

/** GET /wallet/list → array of { id, user_id, public_address, balances: [{asset_symbol, amount}] } */
async function fetchUserWallets() {
    return fetchWithAuth('/wallet/list', { method: 'GET' });
}

/** GET /wallet/balance → array of { asset_symbol, usd_value, amount } */
async function fetchWalletBalances() {
    return fetchWithAuth('/wallet/balance', { method: 'GET' });
}

/** POST /wallet/create → returns created wallet */
async function createWallet(symbol = 'ETH', name = '') {
    return fetchWithAuth('/wallet/create', { 
        method: 'POST',
        body: JSON.stringify({ asset_symbol: symbol, name: name })
    });
}

// ==========================================
// 4. TRANSACTION ENDPOINTS
// ==========================================

/** GET /transaction/history → array of TransactionResponse */
async function fetchTransactions(skip = 0, limit = 100) {
    return fetchWithAuth(`/transaction/history?skip=${skip}&limit=${limit}`, { method: 'GET' });
}

/**
 * POST /transaction/send
 * @param {{ from_address, to_address, asset_symbol, amount, otp? }} payload
 */
async function sendCrypto(payload) {
    return fetchWithAuth('/transaction/send', { method: 'POST', body: JSON.stringify(payload) });
}

/** POST /transaction/estimate-fee */
async function estimateFee(asset_symbol, amount) {
    return fetchWithAuth('/transaction/estimate-fee', {
        method: 'POST',
        body: JSON.stringify({ asset_symbol, amount })
    });
}

// ==========================================
// 5. MARKET ENDPOINTS
// ==========================================

/** GET /market/prices → { prices: { BTC: {price, change_24h}, ... } } */
async function fetchMarketPrices() {
    const data = await fetchWithAuth('/market/prices', { method: 'GET' });
    return data?.prices || {};
}

async function fetchTopGainers() {
    const data = await fetchWithAuth('/market/top-gainers', { method: 'GET' });
    return data?.gainers || [];
}

async function fetchTopLosers() {
    const data = await fetchWithAuth('/market/top-losers', { method: 'GET' });
    return data?.losers || [];
}

// ==========================================
// 6. STAKING ENDPOINTS
// ==========================================

/** GET /staking/portfolio → array of stake portfolio entries */
async function fetchStakingPortfolio() {
    return fetchWithAuth('/staking/portfolio', { method: 'GET' });
}

/**
 * POST /staking/
 * @param {{ wallet_id, asset_symbol, amount, apy }} payload
 */
async function stakeAsset(payload) {
    return fetchWithAuth('/staking/', { method: 'POST', body: JSON.stringify(payload) });
}

/**
 * POST /staking/unstake
 * @param {number} stake_id
 */
async function unstakeAsset(stake_id) {
    return fetchWithAuth('/staking/unstake', { method: 'POST', body: JSON.stringify({ stake_id }) });
}

// ==========================================
// 7. GLOBAL EXPORT
// ==========================================

window.api = {
    AuthState,
    fetchWithAuth,
    // Auth
    registerUser, sendOtp, verifyOtp, loginUser, logoutUser, fetchUserProfile,
    // Wallet
    fetchUserWallets, fetchWalletBalances, createWallet,
    // Transactions
    fetchTransactions, sendCrypto, estimateFee,
    // Market
    fetchMarketPrices, fetchTopGainers, fetchTopLosers,
    // Staking
    fetchStakingPortfolio, stakeAsset, unstakeAsset,
};
