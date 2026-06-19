const API = {
  async getUser() {
    return Promise.resolve(MockData.user); // No direct user profile API yet
  },

  async getPortfolio(period = '1D') {
    try {
      const balances = await window.api.fetchWalletBalances();
      let totalUsd = 0;
      let alloc = [];
      const colors = ['#d4f042', '#7dd3fc', '#fb923c', '#d1d5db', '#e5e7eb'];
      
      balances.forEach((b, i) => {
        totalUsd += b.usd_value;
        alloc.push({
          symbol: b.asset_symbol,
          name: b.asset_symbol === 'ETH' ? 'Ethereum' : b.asset_symbol,
          pct: 0,
          color: colors[i % colors.length]
        });
      });
      
      alloc.forEach(a => {
        const b = balances.find(x => x.asset_symbol === a.symbol);
        a.pct = totalUsd > 0 ? (b.usd_value / totalUsd) * 100 : 0;
      });
      
      return {
        ...MockData.portfolio,
        totalValueUSD: totalUsd,
        allocation: alloc.length > 0 ? alloc : MockData.portfolio.allocation
      };
    } catch (e) {
      console.error("Failed portfolio fallback to mock", e);
      return Promise.resolve(MockData.portfolio);
    }
  },

  async getWallets() {
    try {
      const rawWallets = await window.api.fetchUserWallets();
      const marketPrices = await window.api.fetchMarketPrices();
      
      let mappedWallets = [];
      rawWallets.forEach(w => {
        if (w.balances && w.balances.length > 0) {
          w.balances.forEach(b => {
            const symbol = b.asset_symbol;
            const balance = b.amount;
            const price = marketPrices[symbol] ? marketPrices[symbol].price : 0;
            const change = marketPrices[symbol] ? marketPrices[symbol].change_24h : 0;
            
            let name = symbol;
            let iconLabel = symbol[0];
            let iconClass = 'default-icon';
            if (symbol === 'ETH') { name = 'Ethereum'; iconLabel = 'Ξ'; iconClass = 'eth-icon'; }
            else if (symbol === 'BTC') { name = 'Bitcoin'; iconLabel = '₿'; iconClass = 'btc-icon'; }
            else if (symbol === 'USDT') { name = 'Tether'; iconLabel = 'T'; iconClass = 'usdt-icon'; }
            else if (symbol === 'SOL') { name = 'Solana'; iconLabel = '◎'; iconClass = 'sol-icon'; }
            
            mappedWallets.push({
              id: `${w.id}_${symbol}`,
              name: name,
              symbol: symbol,
              iconClass: iconClass,
              iconLabel: iconLabel,
              network: 'Crypto Network',
              address: w.public_address,
              balance: balance,
              priceUSD: price,
              change24h: change,
              type: 'crypto'
            });
          });
        } else {
            mappedWallets.push({
              id: w.id.toString(),
              name: 'Ethereum',
              symbol: 'ETH',
              iconClass: 'eth-icon',
              iconLabel: 'Ξ',
              network: 'Crypto Network',
              address: w.public_address,
              balance: 0,
              priceUSD: marketPrices['ETH'] ? marketPrices['ETH'].price : 0,
              change24h: marketPrices['ETH'] ? marketPrices['ETH'].change_24h : 0,
              type: 'crypto'
            });
        }
      });
      return mappedWallets;
    } catch (e) {
      console.error("Failed wallets fallback to mock", e);
      return Promise.resolve(MockData.wallets);
    }
  },

  async getTransactions({ page = 1, perPage = 10, asset = null, type = null, search = '', walletId = 'All' } = {}) {
    try {
      const rawTxs = await window.api.fetchTransactions();
      const marketPrices = await window.api.fetchMarketPrices();
      
      let txs = rawTxs.map(t => {
        const price = marketPrices[t.asset_symbol] ? marketPrices[t.asset_symbol].price : 0;
        return {
          id: `tx_${t.id}`,
          type: 'send',
          status: t.status.toLowerCase(),
          amount: t.amount,
          asset: t.asset_symbol,
          usdValue: t.amount * price,
          date: t.created_at,
          description: `Transfer`,
          fromAddress: t.from_address,
          toAddress: t.to_address,
          fee: 0
        };
      });

      if (asset && asset !== 'All') txs = txs.filter(t => t.asset === asset);
      if (type && type !== 'All')  txs = txs.filter(t => t.type  === type);
      if (search) {
        const q = search.toLowerCase().trim();
        txs = txs.filter(t => 
          t.description.toLowerCase().includes(q) || 
          t.asset.toLowerCase().includes(q) || 
          (t.toAddress && t.toAddress.toLowerCase().includes(q)) || 
          (t.fromAddress && t.fromAddress.toLowerCase().includes(q)) ||
          (t.id && t.id.toLowerCase().includes(q))
        );
      }
      
      const total = txs.length;
      const start = (page - 1) * perPage;
      return { data: txs.slice(start, start + perPage), total, page, perPage };
      
    } catch (e) {
      console.error("Failed txs fallback to mock", e);
      let txs = [...MockData.transactions];
      if (walletId && walletId !== 'All') {
        const wallet = MockData.wallets.find(w => w.id === walletId);
        if (wallet) txs = txs.filter(t => t.asset === wallet.symbol);
      }
      if (asset && asset !== 'All') txs = txs.filter(t => t.asset === asset);
      if (type && type !== 'All')  txs = txs.filter(t => t.type  === type);
      if (search) {
        const q = search.toLowerCase().trim();
        txs = txs.filter(t => t.description.toLowerCase().includes(q) || t.asset.toLowerCase().includes(q) || (t.toAddress && t.toAddress.toLowerCase().includes(q)) || (t.fromAddress && t.fromAddress.toLowerCase().includes(q)) || (t.id && t.id.toLowerCase().includes(q)));
      }
      const total = txs.length;
      const start = (page - 1) * perPage;
      return Promise.resolve({ data: txs.slice(start, start + perPage), total, page, perPage });
    }
  },

  async getMarket({ filter = 'All', search = '' } = {}) {
    try {
      const prices = await window.api.fetchMarketPrices();
      let coins = Object.entries(prices).map(([sym, data]) => {
         return {
           id: `coin_${sym.toLowerCase()}`,
           name: sym,
           symbol: sym,
           price: data.price,
           change24h: data.change_24h,
           volume24h: data.volume_24h,
           marketCap: 1000000,
           sparkline: MockData.market[0].sparkline // steal from mock
         };
      });
      
      if (search) {
        const q = search.toLowerCase().trim();
        coins = coins.filter(c => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
      }
      if (filter === 'Favourites') {
        coins = coins.filter(c => AppState.favourites.includes(c.symbol));
      } else if (filter === 'Top Gainers') {
        coins = coins.filter(c => c.change24h > 0).sort((a, b) => b.change24h - a.change24h);
      } else if (filter === 'Top Losers') {
        coins = coins.filter(c => c.change24h < 0).sort((a, b) => a.change24h - b.change24h);
      }
      return coins;
    } catch (e) {
      console.error("Failed market fallback to mock", e);
      let coins = [...MockData.market];
      if (search) {
        const q = search.toLowerCase().trim();
        coins = coins.filter(c => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
      }
      if (filter === 'Favourites') coins = coins.filter(c => AppState.favourites.includes(c.symbol));
      else if (filter === 'Top Gainers') coins = coins.filter(c => c.change24h > 0).sort((a, b) => b.change24h - a.change24h);
      else if (filter === 'Top Losers') coins = coins.filter(c => c.change24h < 0).sort((a, b) => a.change24h - b.change24h);
      return Promise.resolve(coins);
    }
  },

  async getStaking() {
    try {
      const portfolio = await window.api.fetchStakingPortfolio();
      // Combine with mock lockOptions
      return {
        ...MockData.staking,
        totalStaked: portfolio.total_staked_usd || 0,
        positions: portfolio.stakes.map(s => ({
            id: `stk_${s.id}`,
            asset: s.asset_symbol,
            amount: s.amount,
            usdValue: s.amount * 3000, // mock price
            apy: s.apy,
            lockDays: s.lock_period_days,
            startDate: s.created_at,
            endDate: new Date(new Date(s.created_at).getTime() + s.lock_period_days*24*60*60*1000).toISOString(),
            status: s.status.toLowerCase(),
            earned: s.rewards_earned
        }))
      };
    } catch(e) {
      return Promise.resolve(MockData.staking);
    }
  },

  async getSentiment() {
    return Promise.resolve(MockData.sentiment);
  },
};
