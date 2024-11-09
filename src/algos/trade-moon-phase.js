const axios = require('axios');
const Binance = require('binance-api-node').default;
const { connectDB, getDB } = require('../database/db');
const client = Binance();

// Moon phase strategy variables
const newMoonReferenceDate = new Date('2021-01-13T05:00:00Z').getTime();
const moonCycle = 2551442876.8992; // Lunar cycle duration in milliseconds

let lastNewMoonPrice = 0;
let lastFullMoonPrice = 0;

// Liquidity Heat map
const liquidationData = {}; // Stores all liquidation data
let hotZone = []; // Stores the identified Hot Zone
let H1 = []; // Sum of high liquidation total
let L1 = []; // Sum of low liquidation total

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



// Run the

module.exports = { broadcastMoonPhaseAndSignals, monitorCoinsForOI, fetchAndBroadcastTradeData };
