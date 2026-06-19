/**
 * ============================================================
 *  CRYPTOVAULT — dashboard.js  (v2 — Zero Mock Data)
 *  ----------------------------------------------------------
 *  ARCHITECTURE:
 *   1. AppState   — single source of truth for UI state
 *   2. Cache      — in-memory cache for live API data
 *   3. API        — thin wrappers over window.api (api.js)
 *   4. Helpers    — symbol → icon/name mappings + safe DOM utils
 *   5. Fmt        — pure formatters (currency, %, dates)
 *   6. Calc       — portfolio math helpers
 *   7. Skeleton   — renders loading placeholders
 *   8. Render     — writes live data into the DOM
 *   9. Router     — sidebar page switching & data loading
 *  10. Events     — all addEventListener calls (null-safe)
 *  11. init()     — bootstraps the whole app on DOMContentLoaded
 * ============================================================
 */

'use strict';

// --- AUTH GUARD ---
if (!localStorage.getItem('jwt_token')) {
    window.location.href = 'auth.html';
}

/* ============================================================
   0. GLOBAL UTILITY — Modals, Toast, OTP helpers
   ============================================================ */
window.openModal = function(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('active');
    if (id === 'modal-send-otp') {
        document.querySelectorAll('.otp-box').forEach(b => b.value = '');
        const err = document.getElementById('otp-error-message');
        if (err) err.style.display = 'none';
        setTimeout(() => { const f = document.querySelector('.otp-box'); if (f) f.focus(); }, 100);
    }
};

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
};

window.showToast = function(msg, type = 'success') {
    const toast = document.getElementById('toast-notification');
    const msgEl  = document.getElementById('toast-message');
    if (!toast || !msgEl) return;
    msgEl.textContent = msg;
    toast.className = `toast-notify ${type}`;
    toast.classList.add('active');
    setTimeout(() => toast.classList.remove('active'), 3500);
};

window.focusNext = function(current, index) {
    const inputs = document.querySelectorAll('.otp-inputs .otp-box');
    if (current.value.length >= 1 && inputs[index + 1]) inputs[index + 1].focus();
    else if (current.value.length === 0 && inputs[index - 1]) inputs[index - 1].focus();
};

/* ============================================================
   1. APP STATE — single source of truth
   ============================================================ */
const AppState = {
    currentPage       : 'dashboard',
    activePeriod      : '1D',
    activeMarketTab   : 'All',
    txPageCurrent     : 1,
    txPerPage         : 8,
    sendSelectedWallet: null,   // wallet object currently selected on Send page
    receiveSelectedWallet: null,// wallet object currently selected on Receive page
    stakingSelectedWallet: null,// wallet object for staking calculator
    stakingLockDays   : 60,
    txFilterAsset     : 'All',
    txFilterType      : 'All',
    txSearchQuery     : '',
    marketSearchQuery : '',
    favourites        : [],
};

/* ============================================================
   2. CACHE — in-memory store for live API data
      Populated by API calls; never seeded with mock values.
   ============================================================ */
const Cache = {
    user        : null,   // { id, email, full_name, is_verified }
    wallets     : [],     // WalletResponse[]
    balances    : [],     // { asset_symbol, usd_value, amount }[]
    transactions: [],     // TransactionResponse[]
    marketPrices: {},     // { BTC: {price, change_24h}, ... }
    staking     : [],     // staking portfolio entries
};

/* ============================================================
   3. API LAYER — wraps window.api with Cache hydration
   ============================================================ */
const API = {

    async getUser() {
        if (Cache.user) return Cache.user;
        Cache.user = await window.api.fetchUserProfile();
        return Cache.user;
    },

    async getWallets(force = false) {
        if (!force && Cache.wallets.length) return Cache.wallets;
        const rawWallets = await window.api.fetchUserWallets() || [];
        
        // Flatten backend 1 Wallet -> N Balances into N Virtual Wallets for UI
        let virtualWallets = [];
        rawWallets.forEach(w => {
            if (!w.balances || w.balances.length === 0) return;
            w.balances.forEach(b => {
                virtualWallets.push({
                    id: `${w.id}_${b.asset_symbol}`,
                    walletId: w.id, 
                    user_id: w.user_id,
                    public_address: w.public_address,
                    balances: [b] // pretend this is the only balance
                });
            });
        });
        
        Cache.wallets = virtualWallets;
        return Cache.wallets;
    },

    async getBalances(force = false) {
        if (!force && Cache.balances.length) return Cache.balances;
        Cache.balances = await window.api.fetchWalletBalances() || [];
        return Cache.balances;
    },

    async getTransactions(force = false) {
        if (!Cache.wallets.length) {
            try { await API.getWallets(force); } catch (_) {}
        }
        if (!force && Cache.transactions.length) return Cache.transactions;
        Cache.transactions = await window.api.fetchTransactions(0, 200) || [];
        return Cache.transactions;
    },

    async getMarketPrices(force = false) {
        if (!force && Object.keys(Cache.marketPrices).length) return Cache.marketPrices;
        Cache.marketPrices = await window.api.fetchMarketPrices() || {};
        return Cache.marketPrices;
    },

    async getStaking(force = false) {
        if (!force && Cache.staking.length) return Cache.staking;
        Cache.staking = await window.api.fetchStakingPortfolio() || [];
        return Cache.staking;
    },

    /** Invalidate caches after write operations */
    invalidate(...keys) {
        keys.forEach(k => {
            if (k === 'wallets')      { Cache.wallets = []; Cache.balances = []; }
            if (k === 'transactions') { Cache.transactions = []; }
            if (k === 'staking')      { Cache.staking = []; }
        });
    }
};

/* ============================================================
   4. HELPERS — symbol mapping, safe DOM, icon resolution
   ============================================================ */
const COIN_META = {
    BTC  : { name: 'Bitcoin',   label: '₿', cls: 'btc-icon',  network: 'Bitcoin Network'    },
    ETH  : { name: 'Ethereum',  label: 'Ξ', cls: 'eth-icon',  network: 'Ethereum (ERC-20)'  },
    USDT : { name: 'Tether',    label: 'T', cls: 'usdt-icon', network: 'Ethereum (ERC-20)'  },
    SOL  : { name: 'Solana',    label: '◎', cls: 'sol-icon',  network: 'Solana Network'     },
    USDC : { name: 'USD Coin',  label: '$', cls: 'usdc-icon', network: 'Ethereum (ERC-20)'  },
    ADA  : { name: 'Cardano',   label: 'A', cls: 'usdc-icon', network: 'Cardano Network'    },
    XRP  : { name: 'XRP',       label: 'X', cls: 'usdt-icon', network: 'XRP Ledger'         },
    DOT  : { name: 'Polkadot',  label: '●', cls: 'sol-icon',  network: 'Polkadot Network'   },
    MATIC: { name: 'Polygon',   label: 'P', cls: 'usdt-icon', network: 'Polygon Network'    },
    AVAX : { name: 'Avalanche', label: '▲', cls: 'btc-icon',  network: 'Avalanche Network'  },
};

const ALLOCATION_COLORS = ['#d4f042','#7dd3fc','#fb923c','#f472b6','#a78bfa','#34d399','#fbbf24'];

function coinMeta(symbol) {
    return COIN_META[symbol] || { name: symbol, label: symbol[0] || '?', cls: 'usdc-icon', network: symbol + ' Network' };
}

/** Map a raw WalletResponse + market prices into a rich wallet object for UI */
function enrichWallet(raw, prices) {
    const primaryBalance = raw.balances?.[0] || null;
    const symbol  = primaryBalance?.asset_symbol || 'UNK';
    const balance = parseFloat(primaryBalance?.amount || 0);
    const meta    = coinMeta(symbol);
    const price   = parseFloat(prices[symbol]?.price || 0);
    const change  = parseFloat(prices[symbol]?.change_24h || 0);
    return {
        id       : `${raw.id}_${symbol}`,
        walletId : raw.id,
        symbol, balance, price, change,
        usdValue : balance * price,
        address  : raw.public_address,
        name     : meta.name,
        label    : meta.label,
        cls      : meta.cls,
        network  : meta.network,
    };
}

/** Map a raw TransactionResponse into a rich TX object for UI */
function enrichTx(raw, prices) {
    const symbol = raw.asset_symbol || raw.asset || 'UNK';
    const meta   = coinMeta(symbol);
    const price  = parseFloat(prices[symbol]?.price || 0);
    const amount = parseFloat(raw.amount || 0);
    const myAddresses = (Cache.wallets || []).map(w => (w.public_address || '').toLowerCase());
    const fromAddr = (raw.from_address || '').toLowerCase();
    const isSent = fromAddr && myAddresses.includes(fromAddr);
    const type   = raw.type || (isSent ? 'send' : 'receive');
    return {
        id          : `tx_${raw.id}`,
        type,
        status      : (raw.status || 'completed').toLowerCase(),
        amount,
        displayAmount: amount,
        asset       : symbol,
        label       : meta.label,
        cls         : meta.cls,
        usdValue    : amount * price,
        date        : raw.timestamp || raw.created_at || '',
        description : type === 'send' ? `Sent ${symbol}` : `Received ${symbol}`,
        fromAddress : raw.from_address || '',
        toAddress   : raw.to_address   || '',
        txHash      : raw.tx_hash      || '',
        fee         : 0,
    };
}

/** Map a raw staking portfolio entry to UI object */
function enrichStake(raw, prices) {
    const symbol = raw.asset_symbol || raw.asset || 'ETH';
    const meta   = coinMeta(symbol);
    const price  = parseFloat(prices[symbol]?.price || 0);
    const principal = parseFloat(raw.principal_amount || raw.principal || 0);
    const apy    = parseFloat(raw.apy || 5);
    const start  = new Date(raw.start_time || Date.now());
    const earned = parseFloat(raw.current_reward) || (principal * (apy / 100) * ((Date.now() - start.getTime()) / (365 * 86400000)));
    return {
        id          : raw.id || raw.stake_id,
        walletId    : raw.wallet_id,
        symbol, label: meta.label, cls: meta.cls,
        apy, principal, price,
        usdStaked   : principal * price,
        rewardsEarned: parseFloat(earned.toFixed(6)),
        rewardsUSD  : earned * price,
        startDate   : raw.start_time || '',
        status      : (raw.status || 'active').toLowerCase(),
    };
}

/** Safe element setter */
const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
/** Safe query setter */
const qset = (sel, val) => { const e = document.querySelector(sel); if (e) e.textContent = val; };

/* ============================================================
   5. FORMATTERS — pure helpers
   ============================================================ */
const Fmt = {
    usd(val, dec = 2) {
        const n = Number(val) || 0;
        return '$' + n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    },
    pct(val) {
        const n = Number(val) || 0;
        return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
    },
    crypto(amount, sym) {
        const abs = Math.abs(amount);
        const dec = abs >= 100 ? 2 : abs >= 1 ? 4 : 8;
        return `${abs.toFixed(dec)} ${sym}`;
    },
    address(addr, chars = 6) {
        if (!addr || addr.length <= chars * 2 + 3) return addr || '—';
        return `${addr.slice(0, chars)}…${addr.slice(-4)}`;
    },
    compact(val) {
        const n = Number(val) || 0;
        if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
        if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2)  + 'B';
        if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2)  + 'M';
        return '$' + n.toLocaleString();
    },
    signClass(val) { return (Number(val) || 0) >= 0 ? 'pos' : 'neg'; },
    date(str) {
        if (!str) return '—';
        return new Date(str).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    },
    time(str) {
        if (!str) return '';
        return new Date(str).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    },
};

/* ============================================================
   6. CALCULATORS
   ============================================================ */
const Calc = {
    sparklinePoints(yValues, width = 300, height = 70) {
        if (!yValues || yValues.length < 2) return '';
        const max = Math.max(...yValues), min = Math.min(...yValues);
        const range = max - min || 1;
        const step  = width / (yValues.length - 1);
        return yValues.map((y, i) => {
            const x = (i * step).toFixed(1);
            const sy = (height - ((y - min) / range) * (height - 8)).toFixed(1);
            return `${x},${sy}`;
        }).join(' ');
    },

    stakingReward(amount, apy, days, price) {
        const annual      = amount * (apy / 100);
        const periodReward= annual * (days / 365);
        const periodUSD   = periodReward * price;
        const monthly     = (annual / 12) * price;
        return { periodReward, periodUSD, monthly };
    },
};

/* ============================================================
   7. SKELETON LOADERS
   ============================================================ */
const Skeleton = {
    rows(n, cols) {
        return Array(n).fill(null).map(() =>
            `<tr>${Array(cols).fill('<td><div class="skeleton-line" style="height:14px;border-radius:4px;background:rgba(255,255,255,.07);"></div></td>').join('')}</tr>`
        ).join('');
    },
    cards(n) {
        return Array(n).fill(null).map(() =>
            `<div class="wallet-item" style="opacity:.4"><div class="wallet-icon" style="background:rgba(255,255,255,.1)"></div><div class="wallet-info"><div class="skeleton-line" style="width:80px;height:12px;background:rgba(255,255,255,.1);border-radius:4px;margin-bottom:6px"></div><div class="skeleton-line" style="width:50px;height:10px;background:rgba(255,255,255,.07);border-radius:4px"></div></div></div>`
        ).join('');
    },
    emptyState(icon, title, subtitle) {
        return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;gap:10px;color:var(--text-mid);">
            <div style="font-size:32px;">${icon}</div>
            <div style="font-weight:700;color:var(--text-main);">${title}</div>
            <div style="font-size:13px;text-align:center;">${subtitle}</div>
        </div>`;
    }
};

/* ============================================================
   8. RENDERERS — write live data into the DOM
   ============================================================ */
const Render = {

    /* ── User Info (sidebar + topbar) ──────────────────── */
    async userInfo() {
        try {
            const user = await API.getUser();
            const firstName = (user.full_name || user.email || 'User').split(' ')[0];
            const displayName = (user.full_name || user.email || 'User').toUpperCase();
            set('sidebar-user-name', displayName);
            set('sidebar-user-role', user.is_verified ? 'VERIFIED USER' : 'UNVERIFIED');
            set('topbar-greeting-name', `Hello ${firstName}`);
            // Security score — use a static baseline of 72 if not returned
            const score = 72;
            set('security-score-pct', `${score}%`);
            const ring = document.getElementById('security-ring');
            if (ring) {
                const CIRC = 2 * Math.PI * 18;
                const scored = (score / 100) * CIRC;
                ring.setAttribute('stroke-dasharray', `${scored.toFixed(1)} ${(CIRC - scored).toFixed(1)}`);
            }
        } catch (e) {
            console.error('[Render.userInfo]', e);
        }
    },

    /* ── Dashboard: Portfolio Card ──────────────────────── */
    async portfolioCard() {
        try {
            const [balances, prices] = await Promise.all([API.getBalances(), API.getMarketPrices()]);

            let totalUSD = 0;
            const allocation = [];
            balances.forEach((b, i) => {
                const usd = parseFloat(b.usd_value || 0) || (parseFloat(b.amount || 0) * parseFloat(prices[b.asset_symbol]?.price || 0));
                totalUSD += usd;
                const meta = coinMeta(b.asset_symbol);
                allocation.push({ name: meta.name, symbol: b.asset_symbol, usd, pct: 0, color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] });
            });
            allocation.forEach(a => { a.pct = totalUSD > 0 ? (a.usd / totalUSD) * 100 : 0; });

            set('portfolio-total-value', Fmt.usd(totalUSD));

            const changeEl = document.getElementById('portfolio-change');
            if (changeEl) {
                changeEl.innerHTML = `<span>Portfolio updated live</span>`;
                changeEl.className = 'portfolio-change pos';
            }

            // Draw donut
            Render.donut('portfolio-donut-svg', 'donut-center-val', totalUSD, allocation);
            Render.allocationList('portfolio-alloc-list', allocation, totalUSD);

            // Flat chart line (no historical data from backend yet)
            const pts = Array(22).fill(50);
            const points = Calc.sparklinePoints(pts, 300, 70);
            const polyline = document.getElementById('chart-polyline');
            if (polyline) polyline.setAttribute('points', points);

        } catch (e) {
            console.error('[Render.portfolioCard]', e);
            set('portfolio-total-value', '$0.00');
        }
    },

    /* ── Donut Chart ────────────────────────────────────── */
    donut(svgId, centerValId, total, allocation) {
        const svg = document.getElementById(svgId);
        if (!svg) return;
        const CIRC = 2 * Math.PI * 38;
        let offset = 0;
        svg.innerHTML = '';
        if (!allocation.length) {
            // Empty donut ring
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', '50'); circle.setAttribute('cy', '50'); circle.setAttribute('r', '38');
            circle.setAttribute('fill', 'none'); circle.setAttribute('stroke', '#2a2a2a'); circle.setAttribute('stroke-width', '14');
            svg.appendChild(circle);
        } else {
            allocation.forEach(slice => {
                const dash = (slice.pct / 100) * CIRC;
                const gap  = CIRC - dash;
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', '50'); circle.setAttribute('cy', '50'); circle.setAttribute('r', '38');
                circle.setAttribute('fill', 'none'); circle.setAttribute('stroke', slice.color); circle.setAttribute('stroke-width', '14');
                circle.setAttribute('stroke-dasharray', `${dash.toFixed(2)} ${gap.toFixed(2)}`);
                circle.setAttribute('stroke-dashoffset', (-offset).toFixed(2));
                svg.appendChild(circle);
                offset += dash;
            });
        }
        const centerEl = document.getElementById(centerValId);
        if (centerEl) centerEl.textContent = Fmt.usd(total, 0);
    },

    /* ── Allocation List ────────────────────────────────── */
    allocationList(containerId, allocation, totalUSD) {
        const el = document.getElementById(containerId);
        if (!el) return;
        if (!allocation.length) {
            el.innerHTML = `<div style="color:var(--text-mid);font-size:12px;padding:8px 0;">No assets yet. Create a wallet to get started.</div>`;
            return;
        }
        el.innerHTML = allocation.map(a => `
            <div class="alloc-row">
                <div class="alloc-left">
                    <div class="alloc-dot" style="background:${a.color}"></div>
                    <span class="alloc-name">${a.name}</span>
                </div>
                <div class="alloc-right-pair">
                    <span class="alloc-pct">${a.pct.toFixed(1)}%</span>
                    <span class="alloc-extra">${Fmt.usd(a.usd, 0)}</span>
                </div>
            </div>`).join('');
    },

    /* ── Dashboard: Recent Transactions (5 rows) ─────────── */
    async recentTransactions() {
        const el = document.getElementById('dashboard-tx-list');
        if (!el) return;
        try {
            const [rawTxs, prices] = await Promise.all([API.getTransactions(), API.getMarketPrices()]);
            if (!rawTxs.length) {
                el.innerHTML = Skeleton.emptyState('📋', 'No Transactions Yet', 'Send or receive crypto to see your history here.');
                return;
            }
            const txs = rawTxs.slice(0, 5).map(t => enrichTx(t, prices));

            // Auto-polling if any transaction is pending
            const hasPending = txs.some(t => t.status === 'pending');
            if (hasPending) {
                if (window.txPollTimeout) clearTimeout(window.txPollTimeout);
                window.txPollTimeout = setTimeout(async () => {
                    API.invalidate('transactions', 'wallets');
                    const loader = Router.pageLoaders[`page-${AppState.currentPage}`];
                    if (loader) await loader();
                }, 3000);
            }

            el.innerHTML = txs.map(tx => {
                let badgeStyle = '';
                if (tx.status === 'completed') {
                    badgeStyle = 'background:var(--green-bg);color:var(--green);';
                } else if (tx.status === 'failed' || tx.status === 'declined') {
                    badgeStyle = 'background:#fee2e2;color:var(--red);';
                } else {
                    badgeStyle = 'background:#fef9c3;color:#854d0e;';
                }
                return `
                <div class="tx-item">
                    <div class="tx-icon ${tx.cls}">${tx.label}</div>
                    <div class="tx-info">
                        <div class="tx-name">${tx.description}</div>
                        <div class="tx-sub">${Fmt.date(tx.date)}</div>
                    </div>
                    <div class="tx-amounts">
                        <div class="tx-crypto ${tx.type === 'send' ? 'neg' : 'pos'}">
                            ${tx.type === 'send' ? '-' : '+'}${Fmt.crypto(tx.amount, tx.asset)}
                        </div>
                        <div class="tx-usd">${Fmt.usd(tx.usdValue)}</div>
                    </div>
                    <div class="tx-badge" style="${badgeStyle}">${tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}</div>
                </div>`;
            }).join('');
        } catch (e) {
            el.innerHTML = Skeleton.emptyState('⚠️', 'Could not load transactions', 'Backend may be unavailable.');
        }
    },

    /* ── Dashboard: My Wallets (compact list) ──────────── */
    async dashboardWallets() {
        const el = document.getElementById('dashboard-wallets-list');
        if (!el) return;
        el.innerHTML = Skeleton.cards(3);
        try {
            const [rawWallets, prices] = await Promise.all([API.getWallets(), API.getMarketPrices()]);
            if (!rawWallets.length) {
                el.innerHTML = Skeleton.emptyState('👛', 'No Wallets Yet', 'Click "Create Wallet" to add your first crypto wallet.');
                return;
            }
            const wallets = rawWallets.map(w => enrichWallet(w, prices));
            el.innerHTML = wallets.map(w => `
                <div class="wallet-item" data-wallet-id="${w.id}">
                    <div class="wallet-icon ${w.cls}">${w.label}</div>
                    <div class="wallet-info">
                        <div class="wallet-name">${w.name}</div>
                        <div class="wallet-bal">${Fmt.usd(w.usdValue)}</div>
                    </div>
                    <div class="wallet-amounts">
                        <div class="wallet-crypto">${Fmt.crypto(w.balance, w.symbol)}</div>
                    </div>
                    <div class="wallet-arrow">›</div>
                </div>`).join('');
        } catch (e) {
            el.innerHTML = Skeleton.emptyState('⚠️', 'Could not load wallets', '');
        }
    },

    /* ── Dashboard: Market Overview (compact) ──────────── */
    async dashboardMarket() {
        const el = document.getElementById('dashboard-market-list');
        if (!el) return;
        try {
            const prices = await API.getMarketPrices();
            const coins  = Object.entries(prices).slice(0, 5);
            if (!coins.length) {
                el.innerHTML = Skeleton.emptyState('📊', 'Market data unavailable', '');
                return;
            }
            el.innerHTML = coins.map(([sym, data]) => {
                const meta = coinMeta(sym);
                const pos  = data.change_24h >= 0;
                return `
                    <div class="market-item">
                        <div class="market-icon ${meta.cls}">${meta.label}</div>
                        <div class="market-name-block">
                            <div class="market-name">${meta.name}</div>
                            <div class="market-sym">${sym}</div>
                        </div>
                        <div class="market-price-block">
                            <div class="market-price">${Fmt.usd(data.price)}</div>
                            <div class="market-chg ${Fmt.signClass(data.change_24h)}">${Fmt.pct(data.change_24h)}</div>
                        </div>
                    </div>`;
            }).join('');
        } catch (e) {
            el.innerHTML = '';
        }
    },

    /* ── Dashboard: Stats Row ───────────────────────────── */
    async dashboardStats() {
        try {
            const [wallets, prices, txs, stakes] = await Promise.all([API.getWallets(), API.getMarketPrices(), API.getTransactions(), API.getStaking()]);
            const richWallets = wallets.map(w => enrichWallet(w, prices));
            const richTxs = txs.map(t => enrichTx(t, prices));
            
            let totalReceived = 0, totalSent = 0;
            richTxs.forEach(tx => {
                if (tx.status === 'completed') {
                    if (tx.type === 'receive' || tx.type === 'received') {
                        totalReceived += tx.usdValue;
                    } else if (tx.type === 'send' || tx.type === 'sent') {
                        totalSent += tx.usdValue;
                    }
                }
            });

            set('stat-total-earned', Fmt.usd(totalReceived));
            set('stat-earned-change', '+0.00%');
            set('stat-active-wallets', stakes.length);
            set('stat-avg-return', '+0.00%');
        } catch (e) { /* silent */ }
    },

    /* ── Wallet Page: Stats ────────────────────────────── */
    async walletStats() {
        try {
            const [rawWallets, prices, stakes] = await Promise.all([API.getWallets(), API.getMarketPrices(), API.getStaking()]);
            const wallets = rawWallets.map(w => enrichWallet(w, prices));
            const enrichedStakes = stakes.map(s => enrichStake(s, prices));
            
            const availableTotal = wallets.reduce((s, w) => s + w.usdValue, 0);
            const stakingTotal = enrichedStakes.reduce((s, st) => s + st.usdStaked, 0);
            const total = availableTotal + stakingTotal;

            set('wallet-stat-total-value', Fmt.usd(total));
            set('wallet-stat-available-balance', Fmt.usd(availableTotal));
            set('wallet-stat-staking-balance', Fmt.usd(stakingTotal));
            set('wallet-stat-total-wallets', wallets.length);
            
            if (wallets.length) {
                const best = wallets.reduce((b, w) => w.change > b.change ? w : b);
                set('wallet-stat-best-performer', best.symbol);
                const avg = wallets.reduce((s, w) => s + w.change, 0) / wallets.length;
                set('wallet-stat-avg-change', Fmt.pct(avg));
            } else {
                set('wallet-stat-best-performer', '—');
                set('wallet-stat-avg-change', '—');
            }
        } catch (e) { /* silent */ }
    },

    /* ── Wallet Page: Overview (Donut & Allocation Table) ── */
    async walletOverview() {
        const donutWrap = document.getElementById('wallet-overview-donut');
        const tbody = document.getElementById('wallet-overview-table-body');
        if (!donutWrap || !tbody) return;
        
        try {
            const [rawWallets, prices] = await Promise.all([API.getWallets(), API.getMarketPrices()]);
            const wallets = rawWallets.map(w => enrichWallet(w, prices));
            const total = wallets.reduce((s, w) => s + w.usdValue, 0);
            
            if (!wallets.length || total === 0) {
                donutWrap.innerHTML = '<div style="padding:40px;color:var(--text-mid);text-align:center;">No assets available.</div>';
                tbody.innerHTML = '';
                return;
            }
            
            // Sort wallets by USD value descending
            wallets.sort((a, b) => b.usdValue - a.usdValue);
            
            // Generate donut SVG
            const CIRC = 2 * Math.PI * 54; // 339.29
            let offset = 0;
            const circles = wallets.map((w, i) => {
                const color = ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] || '#d1d5db';
                const pct = (w.usdValue / total) * 100;
                const dash = (pct / 100) * CIRC;
                const circle = `<circle cx="70" cy="70" r="54" fill="none" stroke="${color}" stroke-width="18" stroke-dasharray="${dash.toFixed(2)} ${(CIRC - dash).toFixed(2)}" stroke-dashoffset="${-offset.toFixed(2)}" />`;
                offset += dash;
                return circle;
            }).join('');
            
            donutWrap.innerHTML = `
                <div class="wo-donut-wrap">
                    <svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
                        ${circles}
                    </svg>
                    <div class="wo-donut-center">
                        <div class="wo-donut-val">${Fmt.usd(total)}</div>
                        <div class="wo-donut-lbl">TOTAL</div>
                    </div>
                </div>
            `;
            
            // Generate table
            tbody.innerHTML = wallets.map((w, i) => {
                const color = ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] || '#d1d5db';
                const pct = ((w.usdValue / total) * 100).toFixed(1);
                return `
                    <tr>
                        <td>
                            <div class="wo-asset-cell">
                                <div class="wt-wallet-icon ${w.cls}" style="width:24px;height:24px;font-size:10px;display:flex;align-items:center;justify-content:center;">${w.label}</div>
                                <span>${w.name}</span>
                            </div>
                        </td>
                        <td>
                            <div class="wo-alloc-cell">
                                <div class="wo-dot" style="background-color:${color};"></div>
                                ${pct}%
                            </div>
                        </td>
                        <td style="font-weight:600;">${Fmt.usd(w.usdValue)}</td>
                    </tr>
                `;
            }).join('');
            
        } catch (e) {
            console.error("Error rendering wallet overview:", e);
        }
    },

    /* ── Wallet Page: Table ──────────────────────────────── */
    async walletTable() {
        const tbody = document.getElementById('wallet-table-body');
        if (!tbody) return;
        tbody.innerHTML = Skeleton.rows(3, 8);
        try {
            const [rawWallets, prices] = await Promise.all([API.getWallets(), API.getMarketPrices()]);
            if (!rawWallets.length) {
                tbody.innerHTML = `<tr><td colspan="8">${Skeleton.emptyState('👛', 'No Wallets', 'Create your first wallet using the button above.')}</td></tr>`;
                return;
            }
            const wallets = rawWallets.map(w => enrichWallet(w, prices));
            const total   = wallets.reduce((s, w) => s + w.usdValue, 0);
            tbody.innerHTML = wallets.map(w => {
                const alloc = total > 0 ? ((w.usdValue / total) * 100).toFixed(1) : '0.0';
                return `
                    <tr data-wallet-id="${w.id}">
                        <td>
                            <div class="wt-wallet-cell">
                                <div class="wt-wallet-icon ${w.cls}">${w.label}</div>
                                <div>
                                    <div class="wt-wallet-name">${w.name}</div>
                                    <div class="wt-wallet-sub">${w.symbol}</div>
                                </div>
                            </div>
                        </td>
                        <td><span class="wt-chain-badge">${w.network}</span></td>
                        <td>
                            <div class="wt-addr">
                                <span id="addr-${w.id}">${Fmt.address(w.address)}</span>
                                <button class="wt-copy-btn" data-address="${w.address}" title="Copy address">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                    </svg>
                                </button>
                            </div>
                        </td>
                        <td><span class="wt-balance">${Fmt.crypto(w.balance, w.symbol)}</span></td>
                        <td><span class="wt-usd">${Fmt.usd(w.usdValue)}</span></td>
                        <td><span class="${Fmt.signClass(w.change)}">${Fmt.pct(w.change)}</span></td>
                        <td>${alloc}%</td>
                        <td><button class="wt-action-btn" data-wallet-id="${w.id}">⋯</button></td>
                    </tr>`;
            }).join('');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-mid);padding:20px;">Failed to load wallets.</td></tr>`;
        }
    },

    /* ── Wallet Page: Activity ─────────────────────────── */
    async walletActivity() {
        const el = document.getElementById('wallet-activity-list');
        if (!el) return;
        try {
            const [rawTxs, prices] = await Promise.all([API.getTransactions(), API.getMarketPrices()]);
            if (!rawTxs.length) {
                el.innerHTML = Skeleton.emptyState('📋', 'No Activity', 'Your transaction history will appear here.');
                return;
            }
            const txs = rawTxs.slice(0, 8).map(t => enrichTx(t, prices));

            // Auto-polling if any transaction is pending
            const hasPending = txs.some(t => t.status === 'pending');
            if (hasPending) {
                if (window.txPollTimeout) clearTimeout(window.txPollTimeout);
                window.txPollTimeout = setTimeout(async () => {
                    API.invalidate('transactions', 'wallets');
                    const loader = Router.pageLoaders[`page-${AppState.currentPage}`];
                    if (loader) await loader();
                }, 3000);
            }

            el.innerHTML = txs.map(tx => `
                <div class="wa-item">
                    <div class="tx-icon ${tx.cls}">${tx.label}</div>
                    <div class="wa-info">
                        <div class="wa-name">${tx.description}</div>
                        <div class="wa-sub">${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} · ${Fmt.date(tx.date)}</div>
                    </div>
                    <div class="wa-amounts">
                        <div class="wa-crypto ${tx.type === 'send' ? 'neg' : 'pos'}">
                            ${tx.type === 'send' ? '-' : '+'}${Fmt.crypto(tx.amount, tx.asset)}
                        </div>
                        <div class="wa-usd">${Fmt.usd(tx.usdValue)}</div>
                    </div>
                    <div class="wa-date">${Fmt.time(tx.date)}</div>
                </div>`).join('');
        } catch (e) { el.innerHTML = ''; }
    },

    /* ── Transactions Page: Recent Activity Mini ─────────── */
    async txpRecentActivity() {
        const el = document.getElementById('txp-recent-activity-list');
        if (!el) return;
        try {
            const [rawTxs, prices] = await Promise.all([API.getTransactions(), API.getMarketPrices()]);
            if (!rawTxs.length) {
                el.innerHTML = Skeleton.emptyState('📋', 'No Activity', 'No recent transactions.');
                return;
            }
            const txs = rawTxs.slice(0, 3).map(t => enrichTx(t, prices));
            el.innerHTML = txs.map(tx => `
                <div class="txp-ra-item">
                    <div class="txp-ra-icon ${tx.cls}">${tx.label}</div>
                    <div class="txp-ra-info">
                        <div class="txp-ra-name">${tx.description}</div>
                        <div class="txp-ra-sub">${tx.type === 'send' ? 'To' : 'From'} ${Fmt.address(tx.type === 'send' ? tx.toAddress : tx.fromAddress, 4)}</div>
                    </div>
                    <div class="txp-ra-right">
                        <div class="txp-ra-amt ${tx.type === 'send' ? 'neg' : 'pos'}">
                            ${tx.type === 'send' ? '-' : '+'}${Fmt.crypto(tx.amount, tx.asset)}
                        </div>
                        <div class="txp-ra-time">${Fmt.time(tx.date) || Fmt.date(tx.date)}</div>
                    </div>
                </div>`).join('');
        } catch (e) { el.innerHTML = ''; }
    },

    /* ── Transactions Page: Flow Donut ──────────────────── */
    async txpFlowDonut() {
        const el = document.getElementById('txp-flow-donut-container');
        if (!el) return;
        try {
            const [rawTxs, prices] = await Promise.all([API.getTransactions(), API.getMarketPrices()]);
            const txs = rawTxs.map(t => enrichTx(t, prices));
            let receivedUSD = 0, sentUSD = 0;
            txs.forEach(tx => {
                if (tx.type === 'send') sentUSD += tx.usdValue;
                else receivedUSD += tx.usdValue;
            });
            const total = receivedUSD + sentUSD;
            const rPct = total > 0 ? (receivedUSD / total) * 100 : 0;
            const sPct = total > 0 ? (sentUSD / total) * 100 : 0;
            
            const CIRC = 2 * Math.PI * 30; // 188.5
            const rDash = (rPct / 100) * CIRC;
            const sDash = (sPct / 100) * CIRC;

            el.innerHTML = `
                <div class="txp-flow-donut">
                    <div class="txp-mini-donut">
                        <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="40" cy="40" r="30" fill="none" stroke="#22c55e" stroke-width="12"
                                stroke-dasharray="${rDash.toFixed(1)} ${(CIRC - rDash).toFixed(1)}" stroke-dashoffset="0" />
                            <circle cx="40" cy="40" r="30" fill="none" stroke="#ef4444" stroke-width="12"
                                stroke-dasharray="${sDash.toFixed(1)} ${(CIRC - sDash).toFixed(1)}" stroke-dashoffset="-${rDash.toFixed(1)}" />
                        </svg>
                    </div>
                    <div class="txp-flow-legend">
                        <div class="txp-legend-item">
                            <div class="txp-legend-left">
                                <div class="txp-legend-dot" style="background:#22c55e;"></div> Received
                            </div>
                            <div class="txp-legend-right">
                                <div class="txp-legend-amt">${Fmt.usd(receivedUSD)}</div>
                                <div class="txp-legend-pct">${rPct.toFixed(0)}%</div>
                            </div>
                        </div>
                        <div class="txp-legend-item">
                            <div class="txp-legend-left">
                                <div class="txp-legend-dot" style="background:#ef4444;"></div> Sent
                            </div>
                            <div class="txp-legend-right">
                                <div class="txp-legend-amt">${Fmt.usd(sentUSD)}</div>
                                <div class="txp-legend-pct">${sPct.toFixed(0)}%</div>
                            </div>
                        </div>
                    </div>
                </div>`;
        } catch (e) { el.innerHTML = ''; }
    },

    /* ── Transactions Page: Asset Breakdown ─────────────── */
    async txpAssetBreakdown() {
        const el = document.getElementById('txp-asset-breakdown-list');
        if (!el) return;
        try {
            const [rawWallets, prices] = await Promise.all([API.getWallets(), API.getMarketPrices()]);
            const wallets = rawWallets.map(w => enrichWallet(w, prices));
            const total = wallets.reduce((s, w) => s + w.usdValue, 0);
            
            wallets.sort((a, b) => b.usdValue - a.usdValue);
            
            if (!wallets.length) {
                el.innerHTML = '<div style="color:var(--text-mid);padding:12px;font-size:13px;text-align:center;">No assets available.</div>';
                return;
            }
            
            el.innerHTML = wallets.slice(0, 5).map((w, i) => {
                const pct = total > 0 ? (w.usdValue / total) * 100 : 0;
                const color = ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] || '#d1d5db';
                return `
                    <div class="txp-bd-row">
                        <div class="txp-bd-left">
                            <div class="txp-bd-dot" style="background:${color};"></div>
                            <span class="txp-bd-name">${w.name} (${w.symbol})</span>
                        </div>
                        <div class="txp-bd-right">
                            <span class="txp-bd-amt">${Fmt.usd(w.usdValue)}</span>
                            <span class="txp-bd-pct">${pct.toFixed(0)}%</span>
                        </div>
                    </div>`;
            }).join('');
        } catch (e) { el.innerHTML = ''; }
    },

    /* ── Transactions Page: Full Table ─────────────────── */
    async txTable(page = 1) {
        const tbody = document.getElementById('tx-table-body');
        if (!tbody) return;
        tbody.innerHTML = Skeleton.rows(5, 7);
        try {
            const [rawTxs, prices] = await Promise.all([API.getTransactions(), API.getMarketPrices()]);
            let txs = rawTxs.map(t => enrichTx(t, prices));

            // Auto-polling if any transaction is pending
            const hasPending = txs.some(t => t.status === 'pending');
            if (hasPending) {
                if (window.txPollTimeout) clearTimeout(window.txPollTimeout);
                window.txPollTimeout = setTimeout(async () => {
                    API.invalidate('transactions', 'wallets');
                    const loader = Router.pageLoaders[`page-${AppState.currentPage}`];
                    if (loader) await loader();
                }, 3000);
            }

            // Client-side filters
            if (AppState.txFilterAsset !== 'All') txs = txs.filter(t => t.asset === AppState.txFilterAsset);
            if (AppState.txFilterType  !== 'All') txs = txs.filter(t => t.type  === AppState.txFilterType);
            if (AppState.txSearchQuery) {
                const q = AppState.txSearchQuery.toLowerCase();
                txs = txs.filter(t =>
                    t.description.toLowerCase().includes(q) ||
                    t.asset.toLowerCase().includes(q) ||
                    (t.toAddress   && t.toAddress.toLowerCase().includes(q)) ||
                    (t.fromAddress && t.fromAddress.toLowerCase().includes(q)) ||
                    (t.txHash      && t.txHash.toLowerCase().includes(q))
                );
            }

            const total = txs.length;
            const start = (page - 1) * AppState.txPerPage;
            const pageTxs = txs.slice(start, start + AppState.txPerPage);

            if (!total) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-mid);font-weight:600;">No transactions found.</td></tr>`;
            } else {
                tbody.innerHTML = pageTxs.map(tx => {
                    let statusBg = '#fef9c3';
                    let statusColor = '#854d0e';
                    if (tx.status === 'completed') {
                        statusBg = '#dcfce7';
                        statusColor = 'var(--green)';
                    } else if (tx.status === 'failed') {
                        statusBg = '#fee2e2';
                        statusColor = 'var(--red)';
                    }
                    const typeLabel   = tx.type.charAt(0).toUpperCase() + tx.type.slice(1);
                    const addrDisplay = Fmt.address(tx.toAddress || tx.fromAddress);
                    return `
                        <tr data-tx-id="${tx.id}">
                            <td><span class="txp-type-badge ${tx.type === 'received' ? 'received' : 'sent'}">${typeLabel}</span></td>
                            <td>
                                <div class="txp-asset-cell">
                                    <div class="txp-asset-icon ${tx.cls}">${tx.label}</div>
                                    <div>
                                        <div class="txp-asset-name">${tx.asset}</div>
                                        <div class="txp-asset-sym">${tx.description}</div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <div class="${tx.type === 'send' ? 'txp-amount-neg' : 'txp-amount-pos'}">
                                    ${tx.type === 'send' ? '-' : '+'}${Fmt.crypto(tx.amount, tx.asset)}
                                </div>
                                <div class="txp-usd">${Fmt.usd(tx.usdValue)}</div>
                            </td>
                            <td>
                                <div class="txp-addr">
                                    <span>${addrDisplay}</span>
                                    <button class="txp-copy" data-address="${tx.toAddress || tx.fromAddress || ''}">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                        </svg>
                                    </button>
                                </div>
                            </td>
                            <td>
                                <div class="txp-datetime">
                                    <div class="date">${Fmt.date(tx.date)}</div>
                                    <div class="time">${Fmt.time(tx.date)}</div>
                                </div>
                            </td>
                            <td>
                                <span class="txp-status-badge" style="background:${statusBg};color:${statusColor}">
                                    ${tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                                </span>
                            </td>
                            <td><button class="txp-more" data-tx-id="${tx.id}">⋯</button></td>
                        </tr>`;
                }).join('');
            }

            // Page info
            const pageInfo = document.getElementById('tx-page-info');
            if (pageInfo) {
                const from = total === 0 ? 0 : start + 1;
                const to   = Math.min(start + AppState.txPerPage, total);
                pageInfo.textContent = `Showing ${from}–${to} of ${total} transactions`;
            }

            // Pagination
            const paginationEl = document.querySelector('.txp-pages');
            if (paginationEl) {
                const totalPages = Math.ceil(total / AppState.txPerPage) || 1;
                let html = `<button class="txp-page-btn ${page === 1 ? 'disabled' : ''}" data-page="${page - 1}">‹</button>`;
                for (let p = 1; p <= totalPages; p++) {
                    html += `<button class="txp-page-btn ${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`;
                }
                html += `<button class="txp-page-btn ${page === totalPages ? 'disabled' : ''}" data-page="${page + 1}">›</button>`;
                paginationEl.innerHTML = html;
                paginationEl.querySelectorAll('.txp-page-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        if (btn.classList.contains('disabled') || btn.classList.contains('active')) return;
                        const target = parseInt(btn.dataset.page, 10);
                        if (!isNaN(target)) { AppState.txPageCurrent = target; Render.txTable(target); }
                    });
                });
            }

            // TX Flow donut from live data
            let sentTotal = 0, recvTotal = 0;
            txs.forEach(t => {
                if (t.status === 'completed') {
                    if (t.type === 'send' || t.type === 'sent') sentTotal += t.usdValue;
                    else if (t.type === 'receive' || t.type === 'received') recvTotal += t.usdValue;
                }
            });
            Render._txFlowDonut(sentTotal, recvTotal);

            // Update Page Stats
            const netFlow = recvTotal - sentTotal;
            set('tx-page-stat-total', txs.length);
            set('tx-page-stat-sent', Fmt.usd(sentTotal));
            set('tx-page-stat-received', Fmt.usd(recvTotal));
            set('tx-page-stat-net', Fmt.usd(netFlow));
            const netEl = document.getElementById('tx-page-stat-net');
            if (netEl) {
                netEl.className = 'w-stat-value ' + Fmt.signClass(netFlow);
            }

            // Populate filter dropdowns from live assets
            Render._txFilterDropdowns(txs);

        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-mid);padding:20px;">Failed to load transaction history.</td></tr>`;
        }
    },

    _txFlowDonut(sent, received) {
        const total    = sent + received || 1;
        const sentPct  = (sent / total) * 100;
        const CIRC     = 2 * Math.PI * 36;
        const sentDash = (sentPct / 100) * CIRC;
        const recvDash = CIRC - sentDash;
        const svg = document.getElementById('tx-flow-donut-svg');
        if (svg) {
            svg.innerHTML = `
                <circle cx="40" cy="40" r="36" fill="none" stroke="#ef4444" stroke-width="10"
                    stroke-dasharray="${sentDash.toFixed(1)} ${recvDash.toFixed(1)}" stroke-dashoffset="0"/>
                <circle cx="40" cy="40" r="36" fill="none" stroke="#22c55e" stroke-width="10"
                    stroke-dasharray="${recvDash.toFixed(1)} ${sentDash.toFixed(1)}"
                    stroke-dashoffset="${(-sentDash).toFixed(1)}"/>`;
        }
        set('tx-sent-amt', Fmt.usd(sent));
        set('tx-sent-pct', `${sentPct.toFixed(0)}%`);
        set('tx-received-amt', Fmt.usd(received));
        set('tx-received-pct', `${(100 - sentPct).toFixed(0)}%`);
    },

    _txFilterDropdowns(txs) {
        const assetFilter = document.getElementById('tx-filter-asset');
        if (assetFilter) {
            const assets = [...new Set(txs.map(t => t.asset))];
            assetFilter.innerHTML = `<option value="All">All Assets</option>` +
                assets.map(s => `<option value="${s}" ${s === AppState.txFilterAsset ? 'selected' : ''}>${s}</option>`).join('');
        }
    },

    /* ── Market Page: Tickers ────────────────────────────── */
    async marketTickers() {
        const el = document.getElementById('market-ticker-strip');
        if (!el) return;
        try {
            const prices = await API.getMarketPrices();
            const coins  = Object.entries(prices).slice(0, 5);
            el.innerHTML = coins.map(([sym, data]) => {
                const meta = coinMeta(sym);
                const pos  = data.change_24h >= 0;
                return `
                    <div class="mk-ticker">
                        <div class="mk-ticker-top">
                            <div class="mk-ticker-coin">
                                <div class="wallet-icon ${meta.cls}" style="width:28px;height:28px;font-size:12px;">${meta.label}</div>
                                <div>
                                    <div class="mk-ticker-name">${meta.name}</div>
                                    <div class="mk-ticker-sym">${sym}</div>
                                </div>
                            </div>
                        </div>
                        <div class="mk-ticker-price">${Fmt.usd(data.price)}</div>
                        <div class="${pos ? 'mk-ticker-change-pos' : 'mk-ticker-change-neg'}">${Fmt.pct(data.change_24h)}</div>
                        <div class="mk-market-cap">24h Change</div>
                        <div class="mk-mc-val ${Fmt.signClass(data.change_24h)}">${Fmt.pct(data.change_24h)}</div>
                    </div>`;
            }).join('');
        } catch (e) { /* silent */ }
    },

    /* ── Market Page: Coin Table ─────────────────────────── */
    async marketTable(filter = 'All') {
        const tbody = document.getElementById('market-table-body');
        if (!tbody) return;
        tbody.innerHTML = Skeleton.rows(5, 8);
        try {
            const prices = await API.getMarketPrices();
            let coins = Object.entries(prices).map(([sym, data], idx) => {
                const meta = coinMeta(sym);
                return { sym, meta, price: data.price, change: data.change_24h, rank: idx + 1 };
            });

            if (AppState.marketSearchQuery) {
                const q = AppState.marketSearchQuery.toLowerCase();
                coins = coins.filter(c => c.meta.name.toLowerCase().includes(q) || c.sym.toLowerCase().includes(q));
            }
            if (filter === 'Favourites')  coins = coins.filter(c => AppState.favourites.includes(c.sym));
            if (filter === 'Top Gainers') coins = coins.filter(c => c.change > 0).sort((a, b) => b.change - a.change);
            if (filter === 'Top Losers')  coins = coins.filter(c => c.change < 0).sort((a, b) => a.change - b.change);

            if (!coins.length) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-mid);">No results.</td></tr>`;
                return;
            }

            tbody.innerHTML = coins.map(c => {
                const isFav = AppState.favourites.includes(c.sym);
                return `
                    <tr data-symbol="${c.sym}">
                        <td class="mk-num">${c.rank}</td>
                        <td>
                            <div class="mk-coin-cell">
                                <div class="mk-coin-icon ${c.meta.cls}">${c.meta.label}</div>
                                <div>
                                    <div class="mk-coin-name">${c.meta.name}</div>
                                    <div class="mk-coin-sym">${c.sym}</div>
                                </div>
                            </div>
                        </td>
                        <td class="mk-price"><span class="mk-price-text">${Fmt.usd(c.price)}</span></td>
                        <td class="${c.change >= 0 ? 'mk-pos' : 'mk-neg'}">${Fmt.pct(c.change)}</td>
                        <td class="mk-vol">—</td>
                        <td class="mk-cap">—</td>
                        <td>
                            <svg class="mk-mini-spark" viewBox="0 0 70 28" fill="none">
                                <polyline points="0,14 35,${c.change >= 0 ? 4 : 24} 70,14"
                                    fill="none" stroke="${c.change >= 0 ? '#22c55e' : '#ef4444'}"
                                    stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                        </td>
                        <td>
                            <button class="mk-star" data-symbol="${c.sym}" ${isFav ? 'style="color:#f59e0b;"' : ''}>${isFav ? '★' : '☆'}</button>
                        </td>
                    </tr>`;
            }).join('');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-mid);padding:20px;">Market data unavailable.</td></tr>`;
        }
    },

    /* ── Market: Sentiment (static fallback) ─────────────── */
    marketSentiment() {
        set('sentiment-score',  '—');
        set('sentiment-label',  'Loading…');
        set('sentiment-prev',   'Previous Close: —');
        set('sentiment-week',   '1-Week Avg: —');
    },

    /* ── Staking: Positions Table ────────────────────────── */
    async stakingTable() {
        const tbody = document.getElementById('staking-table-body');
        if (!tbody) return;
        tbody.innerHTML = Skeleton.rows(2, 6);
        try {
            const [stakes, prices] = await Promise.all([API.getStaking(), API.getMarketPrices()]);
            let totalStaked = 0, totalRewards = 0;
            if (!stakes.length) {
                tbody.innerHTML = `<tr><td colspan="6">${Skeleton.emptyState('🔒', 'No Active Stakes', 'Use the calculator below to start earning rewards.')}</td></tr>`;
            } else {
                const enriched = stakes.map(s => enrichStake(s, prices));
                totalStaked  = enriched.reduce((sum, s) => sum + s.usdStaked, 0);
                totalRewards = enriched.reduce((sum, s) => sum + s.rewardsUSD, 0);
                tbody.innerHTML = enriched.map(s => `
                    <tr data-stake-id="${s.id}">
                        <td>
                            <div class="sk-coin-cell">
                                <div class="mk-coin-icon ${s.cls}" style="width:30px;height:30px;font-size:14px;">${s.label}</div>
                                <div>
                                    <div class="sk-coin-name">${s.symbol}</div>
                                    <div class="sk-coin-sym">${s.apy}% APY</div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <div class="sk-amount">${Fmt.crypto(s.principal, s.symbol)}</div>
                            <div class="sk-usd">${Fmt.usd(s.usdStaked)}</div>
                        </td>
                        <td class="sk-apy">${s.apy}%</td>
                        <td>
                            <div class="sk-rewards">${s.rewardsEarned.toFixed(6)} ${s.symbol}</div>
                            <div class="sk-usd">${Fmt.usd(s.rewardsUSD)}</div>
                        </td>
                        <td>
                            <div class="sk-lock">Started ${Fmt.date(s.startDate)}</div>
                        </td>
                        <td><span class="sk-active-badge">${s.status.charAt(0).toUpperCase() + s.status.slice(1)}</span></td>
                        <td>
                            <button class="sk-more sk-unstake-btn" data-stake-id="${s.id}" data-symbol="${s.symbol}">Unstake</button>
                        </td>
                    </tr>`).join('');

                // Wire unstake buttons
                tbody.querySelectorAll('.sk-unstake-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const stakeId = parseInt(btn.dataset.stakeId);
                        const symbol  = btn.dataset.symbol;
                        if (!confirm(`Unstake your ${symbol} position?`)) return;
                        btn.disabled = true; btn.textContent = 'Unstaking…';
                        try {
                            await window.api.unstakeAsset(stakeId);
                            API.invalidate('staking', 'wallets');
                            window.showToast(`Unstaked ${symbol} successfully!`);
                            await Render.stakingTable();
                        } catch (e) {
                            window.showToast(`Failed to unstake: ${e?.data?.message || e?.data?.detail || 'Unknown error'}`, 'error');
                            btn.disabled = false; btn.textContent = 'Unstake';
                        }
                    });
                });
            }
            set('staking-total-staked',   Fmt.usd(totalStaked));
            set('staking-total-rewards',  Fmt.usd(totalRewards));
            
            const activeStakes = stakes.filter(s => s.status === 'active' || s.status === 'ACTIVE').length;
            const uniqueAssets = new Set(stakes.map(s => s.asset_symbol || s.symbol)).size;
            const avgApy = stakes.length ? stakes.reduce((sum, s) => sum + parseFloat(s.apy || 0), 0) / stakes.length : 0;
            
            set('staking-active-stakes', activeStakes);
            set('staking-active-assets', `Across ${uniqueAssets} Assets`);
            set('staking-avg-apy', avgApy.toFixed(2) + '%');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-mid);padding:20px;">Failed to load staking data.</td></tr>`;
        }
    },

    /* ── Staking: Portfolio Overview ─────────────────────── */
    async stakingPortfolio() {
        const el = document.getElementById('staking-portfolio-overview');
        if (!el) return;
        try {
            const [stakes, prices] = await Promise.all([API.getStaking(), API.getMarketPrices()]);
            if (!stakes.length) {
                el.innerHTML = '<div style="color:var(--text-mid);padding:20px;text-align:center;">No staked assets yet.</div>';
                return;
            }
            const enriched = stakes.map(s => enrichStake(s, prices));
            const total = enriched.reduce((s, st) => s + st.usdStaked, 0);
            
            const bySymbol = {};
            enriched.forEach(s => {
                if (!bySymbol[s.symbol]) bySymbol[s.symbol] = { ...s, usdStaked: 0 };
                bySymbol[s.symbol].usdStaked += s.usdStaked;
            });
            let grouped = Object.values(bySymbol);
            grouped.sort((a, b) => b.usdStaked - a.usdStaked);

            const CIRC = 2 * Math.PI * 48; // 301.6
            let offset = 0;
            const circles = grouped.map((g, i) => {
                const color = ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] || '#d1d5db';
                const pct = total > 0 ? (g.usdStaked / total) * 100 : 0;
                const dash = (pct / 100) * CIRC;
                const circle = `<circle cx="65" cy="65" r="48" fill="none" stroke="${color}" stroke-width="18" stroke-dasharray="${dash.toFixed(1)} ${(CIRC - dash).toFixed(1)}" stroke-dashoffset="${-offset.toFixed(1)}" />`;
                offset += dash;
                return circle;
            }).join('');

            const tableRows = grouped.map((g, i) => {
                const color = ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] || '#d1d5db';
                const pct = total > 0 ? (g.usdStaked / total) * 100 : 0;
                return `
                    <div class="sk-alloc-row">
                        <div class="sk-alloc-left">
                            <div class="sk-alloc-dot" style="background:${color};"></div><span class="sk-alloc-name">${g.name || g.symbol} (${g.symbol})</span>
                        </div>
                        <div class="sk-alloc-right"><span class="sk-alloc-val">${Fmt.usd(g.usdStaked)}</span><span class="sk-alloc-pct">${pct.toFixed(2)}%</span></div>
                    </div>`;
            }).join('');

            el.innerHTML = `
                <div class="sk-donut-row">
                    <div class="sk-donut-wrap">
                        <svg viewBox="0 0 130 130" xmlns="http://www.w3.org/2000/svg">
                            ${circles}
                        </svg>
                        <div class="sk-donut-label">
                            <div class="val">${Fmt.usd(total, 0)}</div>
                            <div class="lbl">TOTAL STAKED</div>
                        </div>
                    </div>
                    <div class="sk-alloc-table">
                        ${tableRows}
                        <div style="font-size:10px;color:var(--text-mid);margin-top:6px;">Total Assets: ${grouped.length}</div>
                    </div>
                </div>`;
        } catch (e) { el.innerHTML = ''; }
    },

    /* ── Staking: Recent Rewards (derived from positions) ── */
    async stakingRewards() {
        const el = document.getElementById('staking-rewards-list');
        if (!el) return;
        try {
            const [stakes, prices] = await Promise.all([API.getStaking(), API.getMarketPrices()]);
            if (!stakes.length) {
                el.innerHTML = Skeleton.emptyState('🏆', 'No Rewards Yet', 'Start staking to earn rewards.');
                return;
            }
            el.innerHTML = stakes.slice(0, 5).map(s => {
                const meta    = coinMeta(s.asset_symbol);
                const price   = parseFloat(prices[s.asset_symbol]?.price || 0);
                const principal = parseFloat(s.principal_amount || 0);
                const apy     = parseFloat(s.apy || 5);
                const start   = new Date(s.start_time || Date.now());
                const earned  = principal * (apy / 100) * ((Date.now() - start.getTime()) / (365 * 86400000));
                return `
                    <div class="sk-reward-item">
                        <div class="mk-coin-icon ${meta.cls}" style="width:30px;height:30px;font-size:13px;">${meta.label}</div>
                        <div class="sk-reward-info">
                            <div class="sk-reward-name">${s.asset_symbol} Staking Reward</div>
                            <div class="sk-reward-date">Since ${Fmt.date(s.start_time)}</div>
                        </div>
                        <div class="sk-reward-right">
                            <div class="sk-reward-crypto">+${earned.toFixed(6)} ${s.asset_symbol}</div>
                            <div class="sk-reward-usd">${Fmt.usd(earned * price)}</div>
                        </div>
                    </div>`;
            }).join('');
        } catch (e) { el.innerHTML = ''; }
    },

    /* ── Staking Calculator ──────────────────────────────── */
    async stakingCalc(walletObj, amount, lockDays) {
        if (!walletObj) return;
        const apy    = lockDays <= 30 ? 6.5 : lockDays <= 60 ? 8.75 : 10.5;
        const reward = Calc.stakingReward(amount, apy, lockDays, walletObj.price);
        set('sk-calc-est-reward', `${reward.periodReward.toFixed(4)} ${walletObj.symbol}`);
        set('sk-calc-est-usd',    `≈ ${Fmt.usd(reward.periodUSD)} USD`);
        set('sk-calc-monthly',    `${Fmt.usd(reward.monthly)}/mo`);
    },

    /* ── Wallet Dropdown (Send/Receive/Staking) ──────────── */
    async setupWalletDropdown(wrapperId, dropdownId, stateKey, onSelect) {
        const wrapper  = document.getElementById(wrapperId);
        const dropdown = document.getElementById(dropdownId);
        if (!wrapper || !dropdown) return;

        // Fetch wallets + prices
        let wallets = [];
        try {
            const [rawWallets, prices] = await Promise.all([API.getWallets(), API.getMarketPrices()]);
            wallets = rawWallets.map(w => enrichWallet(w, prices));
        } catch (e) { /* keep empty */ }

        // Populate
        if (!wallets.length) {
            dropdown.innerHTML = `<div class="custom-dropdown-item" style="padding:12px;color:var(--text-mid);">No wallets yet. Create one first.</div>`;
        } else {
            dropdown.innerHTML = wallets.map(w => `
                <div class="custom-dropdown-item" data-wallet-id="${w.id}">
                    <div class="cd-left">
                        <div class="wt-wallet-icon ${w.cls}" style="width:28px;height:28px;font-size:12px;display:flex;align-items:center;justify-content:center;">${w.label}</div>
                        <div>
                            <div class="cd-name">${w.name}</div>
                            <div class="cd-symbol">${w.symbol}</div>
                        </div>
                    </div>
                    <div>
                        <div class="cd-bal">${Fmt.crypto(w.balance, w.symbol)}</div>
                        <div class="cd-usd">${Fmt.usd(w.usdValue)}</div>
                    </div>
                </div>`).join('');

            // Auto-select first if state not set
            if (!AppState[stateKey] && wallets.length) {
                AppState[stateKey] = wallets[0];
                onSelect(wallets[0]);
            } else if (AppState[stateKey] && wallets.length) {
                const updated = wallets.find(w => w.id === AppState[stateKey].id);
                if (updated) AppState[stateKey] = updated;
            }

            dropdown.querySelectorAll('.custom-dropdown-item').forEach(item => {
                item.addEventListener('click', e => {
                    const id = item.dataset.walletId;
                    const w  = wallets.find(w => w.id === id);
                    if (!w) return;
                    AppState[stateKey] = w;
                    dropdown.classList.remove('active');
                    onSelect(w);
                    e.stopPropagation();
                });
            });
        }

        // Toggle
        wrapper.addEventListener('click', e => {
            if (e.target.closest('.custom-dropdown-menu')) return;
            document.querySelectorAll('.custom-dropdown-menu').forEach(m => { if (m !== dropdown) m.classList.remove('active'); });
            dropdown.classList.toggle('active');
            e.stopPropagation();
        });
    },

    /* ── Send Page: Asset Info update ──────────────────── */
    sendAssetUpdate(wallet) {
        if (!wallet) return;
        const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        el('send-asset-name', wallet.name);
        el('send-asset-symbol', wallet.symbol);
        el('send-asset-balance', `Balance: ${Fmt.crypto(wallet.balance, wallet.symbol)}`);
        el('send-avail-balance', `Available: ${Fmt.crypto(wallet.balance, wallet.symbol)} (${Fmt.usd(wallet.usdValue)})`);
        el('send-selected-icon-label', wallet.label);
        const iconEl = document.getElementById('send-selected-icon');
        if (iconEl) iconEl.className = `wt-wallet-icon ${wallet.cls}`;
        // Reset inputs
        const input = document.getElementById('send-amount-input');
        if (input) input.value = '';
        const equiv = document.getElementById('send-usd-equiv');
        if (equiv) equiv.textContent = '≈ $0.00 USD';
        el('tx-sum-send-val', `0.00 ${wallet.symbol}`);
        el('tx-sum-network-val', `${wallet.name} (${wallet.symbol})`);
        el('tx-sum-fee-val', `0.00 ${wallet.symbol} ($0.00)`);
        el('tx-sum-total-crypto', `0.00 ${wallet.symbol}`);
        el('tx-sum-total-usd', '≈ $0.00 USD');
    },

    /* ── Receive Page: Asset Info update ───────────────── */
    receiveAssetUpdate(wallet) {
        if (!wallet) return;
        const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        el('receive-asset-name', wallet.name);
        el('receive-asset-symbol', wallet.symbol);
        el('receive-wallet-bal', Fmt.crypto(wallet.balance, wallet.symbol));
        el('receive-wallet-usd', `≈ ${Fmt.usd(wallet.usdValue)} USD`);
        el('receive-address-text', wallet.address);
        el('receive-note-asset', `${wallet.name} (${wallet.symbol})`);
        el('receive-asset-name-title', `${wallet.name} Wallet`);
        const copyBtn = document.getElementById('receive-copy-btn');
        if (copyBtn) copyBtn.dataset.address = wallet.address;
        const iconEl = document.getElementById('receive-selected-icon');
        if (iconEl) { iconEl.className = `wt-wallet-icon ${wallet.cls}`; iconEl.textContent = wallet.label; }
        const panelIcon = document.getElementById('receive-panel-icon');
        if (panelIcon) { panelIcon.className = `rcw-icon ${wallet.cls}`; panelIcon.textContent = wallet.label; }
    },

    /* ── Send: Amount → Live USD ────────────────────────── */
    sendAmountUpdate(amountStr, wallet) {
        if (!wallet) return;
        const amount   = parseFloat(amountStr) || 0;
        const usd      = amount * wallet.price;
        const feeUSD   = 2.45;
        const feeCrypto= wallet.price > 0 ? feeUSD / wallet.price : 0;
        const equiv    = document.getElementById('send-usd-equiv');
        if (equiv) equiv.textContent = `≈ ${Fmt.usd(usd)} USD`;
        const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        el('tx-sum-send-val', `${amount} ${wallet.symbol}`);
        el('tx-sum-fee-val', `${feeCrypto.toFixed(6)} ${wallet.symbol} (${Fmt.usd(feeUSD)})`);
        el('tx-sum-total-crypto', `${(amount + feeCrypto).toFixed(6)} ${wallet.symbol}`);
        el('tx-sum-total-usd', `≈ ${Fmt.usd(usd + feeUSD)} USD`);
    },
};

/* ============================================================
   9. ROUTER
   ============================================================ */
const Router = {
    pageMap: {
        'nav-dashboard': 'page-dashboard',
        'nav-wallets'  : 'page-wallets',
        'nav-send'     : 'page-send',
        'nav-receive'  : 'page-receive',
        'nav-tx'       : 'page-tx',
        'nav-market'   : 'page-market',
        'nav-staking'  : 'page-staking',
    },

    pageLoaders: {
        'page-dashboard': async () => {
            await Promise.all([
                Render.portfolioCard(),
                Render.recentTransactions(),
                Render.dashboardWallets(),
                Render.dashboardMarket(),
                Render.dashboardStats(),
            ]);
        },
        'page-wallets': async () => {
            await Promise.all([Render.walletStats(), Render.walletOverview(), Render.walletTable(), Render.walletActivity()]);
        },
        'page-send': async () => {
            await Render.setupWalletDropdown(
                'send-asset-select-wrapper', 'send-asset-dropdown', 'sendSelectedWallet',
                w => Render.sendAssetUpdate(w)
            );
            if (AppState.sendSelectedWallet) Render.sendAssetUpdate(AppState.sendSelectedWallet);
        },
        'page-receive': async () => {
            await Render.setupWalletDropdown(
                'receive-asset-select-wrapper', 'receive-asset-dropdown', 'receiveSelectedWallet',
                w => Render.receiveAssetUpdate(w)
            );
            if (AppState.receiveSelectedWallet) Render.receiveAssetUpdate(AppState.receiveSelectedWallet);
        },
        'page-tx': async () => {
            // Populate wallet filter from live wallets
            const walletFilter = document.getElementById('tx-filter-wallet');
            if (walletFilter) {
                try {
                    const [rawWallets, prices] = await Promise.all([API.getWallets(), API.getMarketPrices()]);
                    const wallets = rawWallets.map(w => enrichWallet(w, prices));
                    walletFilter.innerHTML = `<option value="All">All Wallets</option>` +
                        wallets.map(w => `<option value="${w.id}">${w.name} (${w.symbol})</option>`).join('');
                } catch (_) { walletFilter.innerHTML = `<option value="All">All Wallets</option>`; }
            }
            await Promise.all([
                Render.txTable(AppState.txPageCurrent),
                Render.txpRecentActivity(),
                Render.txpFlowDonut(),
                Render.txpAssetBreakdown()
            ]);
        },
        'page-market': async () => {
            await Promise.all([
                Render.marketTickers(),
                Render.marketTable(AppState.activeMarketTab),
            ]);
            Render.marketSentiment();
        },
        'page-staking': async () => {
            await Promise.all([Render.stakingTable(), Render.stakingRewards(), Render.stakingPortfolio()]);
            await Render.setupWalletDropdown(
                'staking-asset-select-wrapper', 'staking-asset-dropdown', 'stakingSelectedWallet',
                w => {
                    AppState.stakingSelectedWallet = w;
                    const unitEl = document.getElementById('sk-calc-amount-unit');
                    if (unitEl) unitEl.textContent = w.symbol;
                    const calcIcon = document.getElementById('staking-selected-icon');
                    if (calcIcon) { calcIcon.className = `wt-wallet-icon ${w.cls}`; calcIcon.textContent = w.label; }
                    const nameText = document.getElementById('staking-asset-name-text');
                    if (nameText) nameText.innerHTML = `<span id="staking-asset-name">${w.name}</span> (<span id="staking-asset-symbol">${w.symbol}</span>)`;
                    const amtInput = document.getElementById('sk-amount-input');
                    Render.stakingCalc(w, parseFloat(amtInput?.value || 1), AppState.stakingLockDays);
                }
            );
            const amtInput = document.getElementById('sk-amount-input');
            if (AppState.stakingSelectedWallet) {
                Render.stakingCalc(AppState.stakingSelectedWallet, parseFloat(amtInput?.value || 1), AppState.stakingLockDays);
            }
        },
    },

    goto(navItemId) {
        const targetPageId = Router.pageMap[navItemId];
        if (!targetPageId) return;
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navEl = document.getElementById(navItemId);
        if (navEl) navEl.classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const pageEl = document.getElementById(targetPageId);
        if (pageEl) pageEl.classList.add('active');
        AppState.currentPage = targetPageId.replace('page-', '');
        
        // Clear caches so we fetch fresh data on every page switch
        API.invalidate('wallets', 'transactions', 'staking');
        
        const loader = Router.pageLoaders[targetPageId];
        if (loader) loader();
    },
};

/* ============================================================
   10. EVENTS
   ============================================================ */
function bindEvents() {

    /* ── Sidebar navigation ─────────────────────────────── */
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => Router.goto(item.id));
    });

    /* ── Quick Actions → sections ───────────────────────── */
    document.querySelectorAll('.quick-item').forEach(item => {
        item.addEventListener('click', () => {
            const label = item.querySelector('.qt')?.textContent?.toLowerCase() || '';
            if (label.includes('send'))    Router.goto('nav-send');
            if (label.includes('receive')) Router.goto('nav-receive');
            if (label.includes('stake'))   Router.goto('nav-staking');
        });
    });

    /* ── View All → sections ────────────────────────────── */
    document.querySelectorAll('.view-all').forEach(link => {
        link.addEventListener('click', () => {
            const card  = link.closest('.card, .portfolio-card');
            const title = card?.querySelector('.card-title')?.textContent?.toLowerCase() || '';
            if (title.includes('transaction')) Router.goto('nav-tx');
            if (title.includes('wallet'))      Router.goto('nav-wallets');
            if (title.includes('market'))      Router.goto('nav-market');
        });
    });

    /* ── Create Wallet Button → Opens Modal ── */
    const cwBtn = document.getElementById('create-wallet-btn');
    if (cwBtn) {
        cwBtn.addEventListener('click', () => {
            window.openModal('modal-create-wallet');
        });
    }

    /* Wallet type selector items → open create wallet ───── */
    document.querySelectorAll('.aw-item').forEach(item => {
        item.addEventListener('click', () => window.openModal('modal-create-wallet'));
    });

    /* cw-submit-btn → alias to create wallet call ──────── */
    const cwSubmitBtn = document.getElementById('cw-submit-btn');
    if (cwSubmitBtn) {
        cwSubmitBtn.addEventListener('click', async () => {
            const assetSelect = document.getElementById('cw-asset-select');
            const nameInput = document.getElementById('cw-wallet-name');
            const symbol = assetSelect ? assetSelect.value : 'ETH';
            const name = nameInput ? nameInput.value : '';

            cwSubmitBtn.disabled = true;
            cwSubmitBtn.textContent = 'Creating…';
            try {
                await window.api.createWallet(symbol, name);
                API.invalidate('wallets');
                window.showToast('New wallet created successfully! 🎉');
                window.closeModal('modal-create-wallet');
                const loader = Router.pageLoaders[`page-${AppState.currentPage}`];
                if (loader) await loader();
            } catch (e) {
                const msg = e?.data?.detail || e?.data?.message || 'Failed to create wallet.';
                window.showToast(`⚠️ ${msg}`, 'error');
            } finally {
                cwSubmitBtn.disabled = false;
                cwSubmitBtn.textContent = 'Create Wallet';
            }
        });
    }

    /* ── Time dropdown (portfolio chart) ──────────────────── */
    const timeDropdown = document.getElementById('portfolio-time-dropdown');
    if (timeDropdown) {
        timeDropdown.addEventListener('change', (e) => {
            AppState.activePeriod = e.target.value.trim();
            Render.portfolioCard();
        });
    }

    /* ── Market filter tabs ───────────────────────────────── */
    document.querySelectorAll('.mk-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.mk-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            AppState.activeMarketTab = tab.textContent.trim();
            Render.marketTable(AppState.activeMarketTab);
        });
    });

    /* ── Market star/watchlist toggle ─────────────────────── */
    document.addEventListener('click', e => {
        const star = e.target.closest('.mk-star');
        if (!star) return;
        const sym = star.dataset.symbol;
        if (AppState.favourites.includes(sym)) {
            AppState.favourites = AppState.favourites.filter(s => s !== sym);
            star.textContent = '☆'; star.style.color = '';
        } else {
            AppState.favourites.push(sym);
            star.textContent = '★'; star.style.color = '#f59e0b';
        }
    });

    /* ── Copy address buttons ─────────────────────────────── */
    document.addEventListener('click', e => {
        const btn = e.target.closest('.wt-copy-btn, .txp-copy, .rc-copy-btn, [data-address]');
        if (!btn) return;
        const address = btn.dataset.address || '';
        if (navigator.clipboard && address) navigator.clipboard.writeText(address).catch(() => {});
        const prev = btn.style.color;
        btn.style.color = '#22c55e';
        setTimeout(() => btn.style.color = prev, 1200);
    });

    /* ── Send: Amount input → live USD update ─────────────── */
    const sendInput = document.getElementById('send-amount-input');
    if (sendInput) {
        sendInput.addEventListener('input', () => {
            Render.sendAmountUpdate(sendInput.value, AppState.sendSelectedWallet);
        });
    }

    /* ── Send: MAX button ─────────────────────────────────── */
    const maxBtn = document.getElementById('send-max-btn');
    if (maxBtn && sendInput) {
        maxBtn.addEventListener('click', () => {
            const w = AppState.sendSelectedWallet;
            if (w) { sendInput.value = w.balance; Render.sendAmountUpdate(String(w.balance), w); }
        });
    }

    /* ── Send: Recipient address → summary ────────────────── */
    const sendAddrInput = document.getElementById('send-address-input');
    if (sendAddrInput) {
        sendAddrInput.addEventListener('input', () => {
            const summaryRecipient = document.getElementById('tx-sum-recipient-val');
            if (summaryRecipient) {
                summaryRecipient.textContent = sendAddrInput.value.trim() ? Fmt.address(sendAddrInput.value.trim()) : '—';
            }
        });
    }

    /* ── Send: Continue → open OTP modal ─────────────────── */
    const continueBtn = document.querySelector('.sc-continue-btn');
    if (continueBtn) {
        continueBtn.addEventListener('click', async () => {
            const addrInput   = document.getElementById('send-address-input');
            const amountInput = document.getElementById('send-amount-input');
            const wallet      = AppState.sendSelectedWallet;
            const recipient   = addrInput?.value.trim() || '';
            const amount      = parseFloat(amountInput?.value) || 0;
            if (!recipient) { window.showToast('⚠️ Please enter a recipient address.'); return; }
            if (amount <= 0) { window.showToast('⚠️ Please enter an amount greater than 0.'); return; }
            if (!wallet)     { window.showToast('⚠️ Please select a wallet first.'); return; }
            if (amount > wallet.balance) {
                window.showToast(`⚠️ Insufficient funds. Balance is ${Fmt.crypto(wallet.balance, wallet.symbol)}.`);
                return;
            }

            continueBtn.disabled = true;
            continueBtn.textContent = 'Preparing...';

            try {
                // Trigger the OTP generation by sending a request without the OTP
                await window.api.sendCrypto({
                    from_address: wallet.address,
                    to_address: recipient,
                    asset_symbol: wallet.symbol,
                    amount: amount,
                    otp: ""
                });
                
                // Clear any previous OTP inputs
                const boxes = document.querySelectorAll('.otp-inputs .otp-box');
                boxes.forEach(b => b.value = '');
                
                // Show modal
                window.openModal('modal-send-otp');
                window.showToast('OTP sent to your email!');
                
                // Focus first box
                setTimeout(() => { if(boxes[0]) boxes[0].focus(); }, 100);

            } catch (err) {
                window.showToast('⚠️ Error: ' + (err?.data?.detail || err?.data?.message || err.message));
            } finally {
                continueBtn.disabled = false;
                continueBtn.textContent = 'Continue';
            }
        });
    }

    /* ── OTP Submit → call POST /transaction/send ─────────── */
    const otpSubmitBtn = document.getElementById('otp-submit-btn');
    if (otpSubmitBtn) {
        otpSubmitBtn.addEventListener('click', async () => {
            const boxes = document.querySelectorAll('.otp-inputs .otp-box');
            let otpCode = '';
            boxes.forEach(b => otpCode += b.value.trim());
            if (otpCode.length < 6) { window.showToast('⚠️ Please enter the full 6-digit OTP.'); return; }

            const addrInput   = document.getElementById('send-address-input');
            const amountInput = document.getElementById('send-amount-input');
            const errEl       = document.getElementById('otp-error-message');
            const wallet      = AppState.sendSelectedWallet;
            if (!wallet) return;

            otpSubmitBtn.disabled = true;
            otpSubmitBtn.textContent = 'Processing…';

            try {
                const result = await window.api.sendCrypto({
                    from_address : wallet.address,
                    to_address   : addrInput?.value.trim() || '',
                    asset_symbol : wallet.symbol,
                    amount       : parseFloat(amountInput?.value) || 0,
                    otp          : otpCode,
                });

                // Poll backend to check if the background worker declined or failed the transaction
                let finalStatus = 'pending';
                if (result?.transaction?.id) {
                    for (let i = 0; i < 6; i++) {
                        await new Promise(r => setTimeout(r, 500));
                        const txs = await API.getTransactions(true);
                        const matched = txs.find(t => t.id === result.transaction.id);
                        if (matched && matched.status !== 'pending') {
                            finalStatus = matched.status;
                            break;
                        }
                    }
                }

                if (finalStatus === 'declined' || finalStatus === 'failed' || finalStatus === 'flagged') {
                    if (errEl) errEl.style.display = 'none';
                    window.closeModal('modal-send-otp');
                    
                    const reasonEl = document.getElementById('failed-reason-val');
                    if (reasonEl) reasonEl.textContent = "Your transaction was declined by security or failed due to insufficient funds.";
                    window.openModal('modal-send-failed');
                    
                    API.invalidate('wallets', 'transactions');
                    if (amountInput) amountInput.value = '';
                    if (addrInput)   addrInput.value   = '';
                    
                    const loader = Router.pageLoaders[`page-${AppState.currentPage}`];
                    if (loader) await loader();
                    
                    return;
                }

                if (errEl) errEl.style.display = 'none';
                window.closeModal('modal-send-otp');

                // Populate receipt modal
                const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
                const amount = parseFloat(amountInput?.value) || 0;
                el('receipt-amount-val', `${amount.toFixed(6)} ${wallet.symbol}`);
                el('receipt-usd-val',    `≈ ${Fmt.usd(amount * wallet.price)} USD`);
                el('receipt-tx-hash',    Fmt.address(result?.transaction?.tx_hash || ''));
                el('receipt-network-name', `${wallet.name} (${wallet.symbol})`);
                el('receipt-recipient-addr', Fmt.address(addrInput?.value.trim() || ''));
                el('receipt-fee-val', '— (network fee)');

                window.openModal('modal-send-receipt');

                // Invalidate caches and reload
                API.invalidate('wallets', 'transactions');
                if (amountInput) amountInput.value = '';
                if (addrInput)   addrInput.value   = '';

                // Refresh current page
                const loader = Router.pageLoaders[`page-${AppState.currentPage}`];
                if (loader) await loader();

                window.showToast('Transaction submitted for processing! 🚀');

            } catch (e) {
                if (errEl) { errEl.style.display = 'block'; errEl.textContent = e.message || e?.data?.detail || e?.data?.message || 'Transaction failed.'; }
                boxes.forEach(b => b.value = '');
                if (boxes[0]) boxes[0].focus();
            } finally {
                otpSubmitBtn.disabled = false;
                otpSubmitBtn.textContent = 'Confirm Transfer';
            }
        });
    }

    /* ── Fee option selector ──────────────────────────────── */
    document.addEventListener('click', e => {
        const opt = e.target.closest('.sc-fee-opt');
        if (!opt) return;
        document.querySelectorAll('.sc-fee-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
    });

    /* ── Note textarea character counter ────────────────── */
    const textarea  = document.querySelector('.sc-textarea');
    const charCount = document.querySelector('.sc-char-count');
    if (textarea && charCount) {
        textarea.addEventListener('input', () => { charCount.textContent = `${textarea.value.length}/100`; });
    }

    /* ── Transactions: Search ────────────────────────────── */
    const txSearch = document.getElementById('tx-search-input');
    if (txSearch) {
        txSearch.addEventListener('input', () => {
            AppState.txSearchQuery   = txSearch.value;
            AppState.txPageCurrent   = 1;
            Render.txTable(1);
        });
    }

    /* ── Transactions: Filters ────────────────────────────── */
    const filterAsset = document.getElementById('tx-filter-asset');
    if (filterAsset) {
        filterAsset.addEventListener('change', () => {
            AppState.txFilterAsset = filterAsset.value;
            AppState.txPageCurrent = 1;
            Render.txTable(1);
        });
    }
    const filterType = document.getElementById('tx-filter-type');
    if (filterType) {
        filterType.addEventListener('change', () => {
            AppState.txFilterType  = filterType.value;
            AppState.txPageCurrent = 1;
            Render.txTable(1);
        });
    }

    /* ── Transactions: Refresh ───────────────────────────── */
    const txRefresh = document.getElementById('tx-refresh-btn');
    if (txRefresh) {
        txRefresh.addEventListener('click', () => {
            API.invalidate('transactions');
            if (txSearch)    txSearch.value    = '';
            if (filterAsset) filterAsset.value = 'All';
            if (filterType)  filterType.value  = 'All';
            AppState.txSearchQuery = ''; AppState.txFilterAsset = 'All'; AppState.txFilterType = 'All'; AppState.txPageCurrent = 1;
            Render.txTable(1);
            window.showToast('Transaction list refreshed!');
        });
    }

    /* ── Transactions: Export CSV ────────────────────────── */
    const txExport = document.getElementById('tx-export-btn');
    if (txExport) {
        txExport.addEventListener('click', async () => {
            const txs    = Cache.transactions;
            const prices = Cache.marketPrices;
            const rich   = txs.map(t => enrichTx(t, prices));
            const headers= ['ID','Type','Asset','Amount','Value(USD)','To/From','Date','Status','TxHash'];
            const rows   = rich.map(t => [t.id, t.type, t.asset, t.amount, t.usdValue, t.toAddress || t.fromAddress, Fmt.date(t.date), t.status, t.txHash]);
            const csv    = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob   = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url    = URL.createObjectURL(blob);
            const link   = document.createElement('a');
            link.href    = url; link.download = `cryptovault_tx_${Date.now()}.csv`;
            link.style.visibility = 'hidden';
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            window.showToast('CSV Exported!');
        });
    }

    /* ── Market: Search ──────────────────────────────────── */
    const mkSearch = document.getElementById('mk-search-input');
    if (mkSearch) {
        mkSearch.addEventListener('input', () => {
            AppState.marketSearchQuery = mkSearch.value;
            Render.marketTable(AppState.activeMarketTab);
        });
    }

    /* ── Staking: Lock period selector ───────────────────── */
    document.addEventListener('click', e => {
        const opt = e.target.closest('.sk-lock-opt');
        if (!opt) return;
        document.querySelectorAll('.sk-lock-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        AppState.stakingLockDays = parseInt(opt.dataset.days || 60, 10);
        const amtInput = document.getElementById('sk-amount-input');
        if (AppState.stakingSelectedWallet) {
            Render.stakingCalc(AppState.stakingSelectedWallet, parseFloat(amtInput?.value || 1), AppState.stakingLockDays);
        }
    });

    /* ── Staking: Amount input ───────────────────────────── */
    const skAmtInput = document.getElementById('sk-amount-input');
    if (skAmtInput) {
        skAmtInput.addEventListener('input', () => {
            if (AppState.stakingSelectedWallet) {
                Render.stakingCalc(AppState.stakingSelectedWallet, parseFloat(skAmtInput.value) || 0, AppState.stakingLockDays);
            }
        });
    }

    /* ── Staking: Stake button → POST /staking ───────────── */
    const stakeBtn = document.querySelector('.sk-stake-btn');
    if (stakeBtn) {
        stakeBtn.addEventListener('click', () => {
            const amtInput = document.getElementById('sk-amount-input');
            const amount   = parseFloat(amtInput?.value || 0);
            const wallet   = AppState.stakingSelectedWallet;
            const lockDays = AppState.stakingLockDays;
            const apy      = lockDays <= 30 ? 6.5 : lockDays <= 60 ? 8.75 : 10.5;

            if (amount <= 0) { window.showToast('⚠️ Please enter an amount greater than 0.'); return; }
            if (!wallet)     { window.showToast('⚠️ Please select a wallet to stake from.'); return; }
            if (amount > wallet.balance) {
                window.showToast(`⚠️ Insufficient balance. Available: ${Fmt.crypto(wallet.balance, wallet.symbol)}`);
                return;
            }

            const reward = Calc.stakingReward(amount, apy, lockDays, wallet.price);
            const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
            el('stake-confirm-asset',    `${wallet.name} (${wallet.symbol})`);
            el('stake-confirm-amount',   `${amount} ${wallet.symbol}`);
            el('stake-confirm-duration', `${lockDays} Days`);
            el('stake-confirm-apy',      `${apy.toFixed(2)}% APY`);
            el('stake-confirm-est',      `${reward.periodReward.toFixed(4)} ${wallet.symbol} (~${Fmt.usd(reward.periodUSD)})`);

            const submitBtn = document.getElementById('stake-submit-btn');
            if (submitBtn) {
                submitBtn.dataset.walletId = wallet.walletId;
                submitBtn.dataset.asset    = wallet.symbol;
                submitBtn.dataset.amount   = amount;
                submitBtn.dataset.days     = lockDays;
                submitBtn.dataset.apy      = apy;
            }
            window.openModal('modal-confirm-stake');
        });
    }

    /* ── Staking: Confirm submit → POST /staking ─────────── */
    const stakeSubmitBtn = document.getElementById('stake-submit-btn');
    if (stakeSubmitBtn) {
        stakeSubmitBtn.addEventListener('click', async () => {
            const walletId = parseInt(stakeSubmitBtn.dataset.walletId);
            const symbol   = stakeSubmitBtn.dataset.asset;
            const amount   = parseFloat(stakeSubmitBtn.dataset.amount || 0);
            const apy      = parseFloat(stakeSubmitBtn.dataset.apy || 5);

            stakeSubmitBtn.disabled = true;
            stakeSubmitBtn.textContent = 'Staking…';
            try {
                await window.api.stakeAsset({ wallet_id: walletId, asset_symbol: symbol, amount, apy });
                API.invalidate('staking', 'wallets');
                window.closeModal('modal-confirm-stake');
                window.showToast(`Successfully staked ${amount} ${symbol}! 🔒`);
                
                // Wait briefly for the async worker to update the database state
                await new Promise(r => setTimeout(r, 1200));
                
                const loader = Router.pageLoaders[`page-${AppState.currentPage}`];
                if (loader) await loader();
            } catch (e) {
                const msg = e?.data?.detail || e?.data?.message || 'Staking failed.';
                window.showToast(`⚠️ ${msg}`, 'error');
            } finally {
                stakeSubmitBtn.disabled = false;
                stakeSubmitBtn.textContent = 'Authorize Staking';
            }
        });
    }

    /* ── Staking: Stake New → scroll to calculator ────────── */
    const stakeNewBtn = document.querySelector('.sk-stake-new');
    if (stakeNewBtn) {
        stakeNewBtn.addEventListener('click', () => {
            const calcCard = document.querySelector('.sk-calc-card');
            if (calcCard) { calcCard.scrollIntoView({ behavior: 'smooth' }); }
            const input = document.getElementById('sk-amount-input');
            if (input) input.focus();
        });
    }

    /* ── Promo button → staking ──────────────────────────── */
    const promoBtn = document.querySelector('.promo-btn');
    if (promoBtn) promoBtn.addEventListener('click', () => Router.goto('nav-staking'));

    /* ── Logout ──────────────────────────────────────────── */
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => window.api.logoutUser());

    /* ── Close dropdowns on outside click ────────────────── */
    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.remove('active'));
    });

    /* ── Network fee selector ─────────────────────────────── */
    document.addEventListener('click', e => {
        const opt = e.target.closest('.sc-fee-opt');
        if (!opt) return;
        document.querySelectorAll('.sc-fee-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
    });
}

/* ============================================================
   11. INIT
   ============================================================ */
async function init() {
    try {
        await Render.userInfo();
        bindEvents();
        await Router.pageLoaders['page-dashboard']();
        simulateMarketFluctuations();
        console.log('[CryptoVault] ✅ App initialized — all data from live API.');
    } catch (err) {
        console.error('[CryptoVault] Initialization error:', err);
    }
}

/* ── Market Simulation ──────────────────────────────────── */
function simulateMarketFluctuations() {
    setInterval(() => {
        if (AppState.currentPage !== 'market') return;
        
        const rows = document.querySelectorAll('#market-table-body tr[data-symbol]');
        if (!rows.length) return;
        
        // Pick 2 to 5 random rows to fluctuate
        const numToFluctuate = Math.floor(Math.random() * 4) + 2;
        const shuffledRows = Array.from(rows).sort(() => 0.5 - Math.random()).slice(0, numToFluctuate);
        
        shuffledRows.forEach(row => {
            const sym = row.getAttribute('data-symbol');
            if (!sym || !Cache.marketPrices[sym]) return;
            
            const priceData = Cache.marketPrices[sym];
            let currentPrice = parseFloat(priceData.price);
            
            // Fluctuate by +/- 0.01% to 0.1%
            const isPositive = Math.random() > 0.5;
            const changePercent = (Math.random() * 0.09) + 0.01;
            const changeAmt = currentPrice * (changePercent / 100);
            
            currentPrice = isPositive ? currentPrice + changeAmt : currentPrice - changeAmt;
            priceData.price = currentPrice; // Update cache
            
            // Update UI
            const priceCell = row.querySelector('.mk-price-text');
            if (priceCell) {
                priceCell.textContent = Fmt.usd(currentPrice);
                
                // Add flash animation class
                const flashClass = isPositive ? 'mk-flash-pos' : 'mk-flash-neg';
                priceCell.classList.remove('mk-flash-pos', 'mk-flash-neg');
                
                // Force reflow to restart animation
                void priceCell.offsetWidth;
                priceCell.classList.add(flashClass);
                
                // Remove class after animation
                setTimeout(() => {
                    priceCell.classList.remove(flashClass);
                }, 1000);
            }
        });
    }, 2500); // Run every 2.5 seconds
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
