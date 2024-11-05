const axios = require('axios');
const Binance = require('binance-api-node').default;
const { connectDB, getDB } = require('./db');
const client = Binance();

// Moon phase strategy variables
const newMoonReferenceDate = new Date('2021-01-13T05:00:00Z').getTime();
const moonCycle = 2551442876.8992; // Lunar cycle duration in milliseconds

let lastNewMoonPrice = 0;
let lastFullMoonPrice = 0;

// OI-related variables
const OIData = []; // To store OI data
const OIPeakThreshold = 0.95; // 95% of the peak zone
const OIBottomThreshold = 0.05; // 5% of the bottom zone
const superHighOIThreshold = 1.1; // 110% or more of peak OI to trigger a REKT warning

// Liquidity Heat map
const liquidationData = {}; // Stores all liquidation data
let hotZone = []; // Stores the identified Hot Zone
let H1 = []; // Sum of high liquidation total
let L1 = []; // Sum of low liquidation total
const chartInstance = null;

// Dune API URL and API key
const DUNE_API_URL = 'https://api.dune.com/api/';
const DUNE_API_KEY = 'QXBhbSq6WuPtvtc7eChHIUwpDnuL5run';
const MURAD_WALLET_QUERY = 'v1/query/4143247/results?limit=1000';

// Fetch current Open Interest via Binance REST API
async function getCurrentOpenInterest(symbol) {
  try {
    const response = await axios.get('https://fapi.binance.com/fapi/v1/openInterest', {
      params: { symbol }
    });
    return parseFloat(response.data.openInterest);
  } catch (error) {
    console.error('Error fetching open interest:', error);
    return null;
  }
}
async function fetchBTCMarketCapData() {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/coins/bitcoin', {
      params: {
        localization: false // Disable localization to get a cleaner response
      }
    });
    const btcMarketCapData = {
      symbol: 'BTCUSDT',
      marketCap: response.data.market_data.market_cap.usd
    };
    return btcMarketCapData; // Return or use this data as needed
  } catch (error) {
    console.error('Error fetching BTC market cap data:', error);
  }
}

// Calculate OI change
async function calculateOIChange(symbol) {
  const currentOI = await getCurrentOpenInterest(symbol);
  const lastOIEntry = OIData.find(oi => oi.symbol === symbol);

  if (!lastOIEntry) {
    // First time fetching this symbol's OI
    OIData.push({ symbol, value: currentOI, time: Date.now() });
    return 0;
  }

  const oiChange = ((currentOI - lastOIEntry.value) / lastOIEntry.value) * 100;
  lastOIEntry.value = currentOI; // Update stored OI value

  return oiChange;
}

// Calculate peak OI in the last 1-day range
function calculatePeakOI(symbol) {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentOI = OIData.filter(oi => oi.time >= oneDayAgo && oi.symbol === symbol).map(oi => oi.value);
  return Math.max(...recentOI);
}

// Calculate bottom OI in the last 3 months
function calculateBottomOI(symbol) {
  const threeMonthsAgo = Date.now() - 3 * 30 * 24 * 60 * 60 * 1000;
  const recentOI = OIData.filter(oi => oi.time >= threeMonthsAgo && oi.symbol === symbol).map(oi => oi.value);
  return Math.min(...recentOI);
}

// Monitor coins for OI change and broadcast trading signals
async function monitorCoinsForOI() {
  // Fetch market cap data to focus on high market cap coins

  const { symbol, marketCap } = await fetchBTCMarketCapData();
  const currentOI = await getCurrentOpenInterest(symbol);
  const oiChange = await calculateOIChange(symbol);
  const peakOI = calculatePeakOI(symbol);
  const bottomOI = calculateBottomOI(symbol);

  let tradeSignal = null;
  let side = null;

  // Recommend closing longs near OI peak
  if (currentOI >= OIPeakThreshold * peakOI) {
    tradeSignal = `SELL (Close Longs for ${symbol})`;
    side = 'short';
  }

  // Recommend going long near local OI bottom
  if (currentOI <= OIBottomThreshold * bottomOI) {
    tradeSignal = `BUY (Open Longs for ${symbol})`;
    side = 'long';
  }

  // Trigger warning if OI is super high (potential market reversal)
  if (currentOI >= superHighOIThreshold * peakOI) {
    tradeSignal = `REKT WARNING: ${symbol} OI is super high! Market may turn around.`;
    side = 'short';
  }

  // Broadcast OI data, OI change, and trade signals
  const OIDataToSend = {
    symbol,
    marketCap,
    currentOI,
    oiChange,
    peakOI,
    bottomOI,
    tradeSignal
  };

  // return data

  if (tradeSignal) {
    console.log(tradeSignal);
  }

  // send Data
  const data = {
    exchange: 'Binance',
    side: side,
    symbol: symbol,
    options: JSON.stringify(OIDataToSend || {}),
    strategy: 'openInterest',
    income_at: Math.floor(Date.now() / 1000)
  };
  return data;
}

// Broadcast trade data to all connected clients
function broadcastTradeData(price, intensity) {
  const tradeData = JSON.stringify({ p: price, i: intensity });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(tradeData);
    }
  });
}

// Fetch order book depth
async function getOrderBookDepth(symbol) {
  try {
    const depth = await client.book({ symbol });
    return depth;
  } catch (error) {
    console.error('Error fetching order book depth:', error);
    return null;
  }
}

// Function to fetch and broadcast latest trade data
async function fetchAndBroadcastTradeData(symbol) {
  try {
     if (!getDB()) {
      await connectDB();
    }
    const trades = await client.trades({ symbol: symbol, limit: 1 });
    if (trades.length > 0) {
      const latestTrade = trades[0];
      const orderBookDepth = await getOrderBookDepth(symbol);
      const intensity = calculateIntensity(orderBookDepth, parseFloat(latestTrade.price));
      const price = parseFloat(latestTrade.price);
      const liquidationZone = { price, intensity };

      if (!liquidationData[symbol]) {
        liquidationData[symbol] = [];
      }
      console.log("Liquidation Data Before::", liquidationData[symbol]);

      liquidationData[symbol].push(liquidationZone);
      console.log("Liquidation Data::", liquidationData);
      

      // Update the sums H1 and L1 based on the current liquidation zone
      updateLiquidationSums(liquidationZone, symbol);

      // Identify the Hot Zone (highest quantum of liquidation)
      hotZone[symbol] = identifyHotZone(liquidationData[symbol]);

      // Calculate direction bias based on current price
      const directionBias = calculateDirectionBias(price, hotZone[symbol]);

      // Recommend trading actions
      const recommendation = recommendTradingAction(directionBias, symbol);




      const json = {
        H1: H1[symbol].toFixed(2),
        L1: L1[symbol].toFixed(2),
        directionBias: directionBias.toFixed(2),
        signal: recommendation.action,
        symbol: recommendation.altAction,
        targetPrice: recommendation.targetPrice
      };

      const db = getDB();
      await db.collection(symbol).insertOne({ price, intensity, timestamp: new Date(), rawData: json  });

      console.log(`Data inserted for ${symbol}:`, { price, intensity });

      // send Data
      const liquidation = {
        exchange: 'Binance',
        symbol: symbol,
        options: JSON.stringify(json || {}),
        strategy: 'Liquidity HeatZone',
        side: recommendation.action,
        income_at: Math.floor(Date.now() / 1000)
      };
      return liquidation;
    }
  } catch (error) {
    console.error('Error fetching trade data:', error);
  }
}
// Function to update the sum of liquidations
function updateLiquidationSums(liquidationZone,symbol) {
  if (!hotZone[symbol]) {
    // If hotZone is not defined, initialize it
    hotZone[symbol] = liquidationZone;
    console.log("Hot zone is symbol not exist:", hotZone[symbol]);
    
  }

  if (hotZone[symbol] && liquidationZone.price >= hotZone[symbol].price) {
    // Update H1 if the current liquidation zone's price is higher or equal to the hotZone price
    H1[symbol] += liquidationZone.intensity;
  } else {
    // Update L1 otherwise
    L1[symbol] += liquidationZone.intensity;
  }

  // Ensure H1 and L1 are valid numbers
  H1[symbol] = isNaN(H1[symbol]) ? 0 : H1[symbol];
  L1[symbol] = isNaN(L1[symbol]) ? 0 : L1[symbol];
}

// Function to identify the highest quantum of liquidation (Hot Zone)
function identifyHotZone(data) {
  return data.reduce((max, zone) => (max.intensity > zone.intensity ? max : zone), data[0]);
}

// Function to calculate direction bias based on current price and Hot Zone
function calculateDirectionBias(currentPrice, hotZone) {
  return hotZone ? hotZone.price - currentPrice : 0;
}

// Function to recommend trading actions based on direction bias
function recommendTradingAction(directionBias, symbol) {
  const action = directionBias > 0 ? 'long' : 'short';
  const altAction = action === 'LONG' ? 'BUY' : 'SELL';
  return {
    action: action,
    altAction: altAction,
    targetPrice: hotZone[symbol] ? hotZone[symbol].price : 0
  };
}
// Function to calculate intensity based on order book depth
function calculateIntensity(orderBookDepth, price) {
  if (!orderBookDepth || !Array.isArray(orderBookDepth.bids) || !Array.isArray(orderBookDepth.asks)) {
    console.error('Invalid order book depth data.');
    return 0;
  }

  // Calculate bid volume
  const bidVolume = orderBookDepth.bids.reduce((sum, bid) => {
    const volume = parseFloat(bid.quantity);
    return !isNaN(volume) ? sum + volume : sum;
  }, 0);

  // Calculate ask volume
  const askVolume = orderBookDepth.asks.reduce((sum, ask) => {
    const volume = parseFloat(ask.quantity);
    return !isNaN(volume) ? sum + volume : sum;
  }, 0);

  // Ensure bidVolume and askVolume are valid numbers
  const totalVolume = bidVolume + askVolume;

  // Determine price level for intensity calculation
  const priceLevel =
    bidVolume > askVolume
      ? orderBookDepth.bids[0]
        ? parseFloat(orderBookDepth.bids[0].price)
        : price
      : orderBookDepth.asks[0]
      ? parseFloat(orderBookDepth.asks[0].price)
      : price;

  // Calculate intensity based on total volume and price difference
  return totalVolume * Math.abs(price - priceLevel);
}

// Calculate the current moon phase
function getCurrentMoonPhase() {
  const currentTime = Date.now();
  const diff = (currentTime - newMoonReferenceDate) % moonCycle;
  return diff / moonCycle;
}

// Broadcast moon phase data and buy/sell signals
async function broadcastMoonPhaseAndSignals(symbol) {
  if (!getDB()) {
    await connectDB();
  }
  
  const moonPhase = getCurrentMoonPhase();
  const isNewMoon = moonPhase < 0.5;
  const isFullMoon = moonPhase > 0.5;
  let side = null;

  const currentPrice = await getCurrentBTCPrice(symbol);
  let tradeSignal = null;
  const db = getDB();
  const getMoonDataBySymbol
    = await db.collection(`moon-phase`).findOne({ symbol });
  if (!getMoonDataBySymbol) { 
    await db.collection(`moon-phase`).findOneAndUpdate(
      { symbol: symbol }, 
      { $set: { lastNewMoonPrice: currentPrice, lastFullMoonPrice: currentPrice, timestamp: new Date(), symbol: symbol } }, 
      { upsert: true } 
    );
    console.log(`Data inserted for ${symbol} Moon Phase:`, { lastNewMoonPrice, lastFullMoonPrice });
  }


  console.log(`${symbol} Moon Phase:`, currentPrice);
  
  if (isNewMoon && lastNewMoonPrice && currentPrice < lastNewMoonPrice) {
    tradeSignal = 'SELL';
    lastNewMoonPrice = currentPrice;
    side = 'short';
    await db.collection(`moon-phase`).findOneAndUpdate(
                { symbol: symbol }, 
                { $set: { lastNewMoonPrice: lastNewMoonPrice, timestamp: new Date() } }, 
                { upsert: true } 
            );
    console.log(`Data updated for ${symbol} Moon Phase:`, { lastNewMoonPrice });

  }

  if (isFullMoon && lastFullMoonPrice && currentPrice > lastFullMoonPrice) {
    tradeSignal = 'BUY';
    lastFullMoonPrice = currentPrice;
    side = 'long';

    //update into DB
    await db.collection(`moon-phase`).findOneAndUpdate(
            { symbol: symbol }, 
            { $set: { lastFullMoonPrice: lastFullMoonPrice, timestamp: new Date() } }, 
            { upsert: true } 
    )
     console.log(`Data updated for ${symbol} Moon Phase:`, { lastFullMoonPrice });
  }

  const json = {
    newMoon: isNewMoon,
    fullMoon: isFullMoon,
    moonPhase,
    tradeSignal
  };

  // send Data
  const moonData = {
    exchange: 'Binance',
    symbol: symbol,
    options: JSON.stringify(json || {}),
    strategy: 'MoonPhase',
    side: side,
    income_at: Math.floor(Date.now() / 1000)
  };

  if (tradeSignal) {
    lastTradeSignal = tradeSignal;
  }
  return moonData;
}

// Fetch the current BTC price from Binance
async function getCurrentBTCPrice(symbol) {
  const ticker = await client.prices({ symbol: symbol });
  return parseFloat(ticker[`${symbol}`]);
}

// Function to call the Dune API
async function callApi(query) {
  try {
    const response = await axios.get(`${DUNE_API_URL}${query}`, {
      headers: { 'x-dune-api-key': DUNE_API_KEY }
    });
    return response.data;
  } catch (error) {
    console.error('Error calling Dune API:', error);
  }
}

// Function to check Murad's transactions
async function checkMuradTransactions() {
  try {
    const data = await callApi(MURAD_WALLET_QUERY);
    if (data && data.result && data.result.rows) {
      const transactions = data.result.rows;
      const groupedData = {};

      transactions.forEach(transaction => {
        const { amount } = transaction;
        const { symbol } = transaction;
        const { direction } = transaction;
        if (!groupedData[symbol]) {
          groupedData[symbol] = {
            buyTotal: 0,
            sellTotal: 0
          };
        }
        if (direction === 'sell') {
          groupedData[symbol].sellTotal += amount;
        } else if (direction === 'buy') {
          groupedData[symbol].buyTotal += amount;
        }
      });
      const json = [];

      for (const symbol in groupedData) {
        const { buyTotal, sellTotal } = groupedData[symbol];
        json.push(`Notification: For ${symbol}, total bought: ${buyTotal}, total sold: ${sellTotal}`);
      }
      const muradData = {
        exchange: 'Dune',
        symbol: 'sol',
        options: JSON.stringify(json || {}),
        strategy: 'MuradWallet',
        income_at: Math.floor(Date.now() / 1000)
      };
      return muradData;
    }
    console.log('No transactions found.');
  } catch (error) {
    console.error('Error fetching data from Dune API:', error);
  }
  return [];
}

// Run the

module.exports = { checkMuradTransactions, broadcastMoonPhaseAndSignals, monitorCoinsForOI, fetchAndBroadcastTradeData };
