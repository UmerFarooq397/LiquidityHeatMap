const axios = require('axios');
const { connectDB, getDB } = require('./../database/db');

// OI-related variables
let OIData = []; // To store OI data
const OIPeakThreshold = 0.95; // 95% of the peak zone
const OIBottomThreshold = 0.05; // 5% of the bottom zone
const superHighOIThreshold = 1.1; // 110% or more of peak OI to trigger a REKT warning


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

        console.log(btcMarketCapData);
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
    if (!getDB()) {
        await connectDB();
    }
    
    const { symbol, marketCap } = await fetchBTCMarketCapData();
    const currentOI = await getCurrentOpenInterest(symbol);
    const oiChange = await calculateOIChange(symbol);
    const peakOI = calculatePeakOI(symbol);
    const bottomOI = calculateBottomOI(symbol);

    let tradeSignal = null;

    // Recommend closing longs near OI peak
    if (currentOI >= OIPeakThreshold * peakOI) {
        tradeSignal = `SELL (Close Longs for ${symbol})`;
    }

    // Recommend going long near local OI bottom
    if (currentOI <= OIBottomThreshold * bottomOI) {
        tradeSignal = `BUY (Open Longs for ${symbol})`;
    }

    // Trigger warning if OI is super high (potential market reversal)
    if (currentOI >= superHighOIThreshold * peakOI) {
        tradeSignal = `REKT WARNING: ${symbol} OI is super high! Market may turn around.`;
    }

    // Broadcast OI data, OI change, and trade signals
    const OIDataToSend = {
        symbol,
        marketCap,
        currentOI,
        oiChange,
        peakOI,
        bottomOI,
        tradeSignal,
        createdTimeStamp: new Date()
    };
    const db = getDB();
    // Send data here
    await db.collection('openInterset-BTC').insertOne(OIDataToSend);

    if (tradeSignal) {
        console.log(tradeSignal);
    }
}

module.exports = { monitorCoinsForOI };
