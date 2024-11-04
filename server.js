const WebSocket = require('ws');
const Binance = require('binance-api-node').default;
const axios = require('axios');

const wss = new WebSocket.Server({ port: 3000 });
const client = Binance();

// Moon phase strategy variables
const newMoonReferenceDate = new Date('2021-01-13T05:00:00Z').getTime();
const moonCycle = 2551442876.8992; // Lunar cycle duration in milliseconds

let lastNewMoonPrice = null;
let lastFullMoonPrice = null;

let marketCapData = [];

// OI-related variables
let OIData = []; // To store OI data
const OIPeakThreshold = 0.95; // 95% of the peak zone
const OIBottomThreshold = 0.05; // 5% of the bottom zone
const superHighOIThreshold = 1.1; // 110% or more of peak OI to trigger a REKT warning
const COINALYZE_API_KEY = '3a5f1420-17bd-474b-84a4-9061a184d2cd';

// Fetch current Open Interest via Coinalyze API
async function getCurrentOpenInterest(symbol) {
    const maxRetries = 3; // Number of retries on failure
    let attempt = 0;

    // Function to make the API request
    const fetchOpenInterest = async () => {
        try {
            const response = await axios.get(`https://api.coinalyze.net/v1/open-interest?symbols=BTCUSD_PERP.A`, {
                headers: {
                    'api_key': `${COINALYZE_API_KEY}`,
                }
            });

            // Check if response is valid
            if (response.data && response.data.length > 0) {
                const oiData = response.data.find(oi => oi.symbol === 'BTCUSD_PERP.A');
                if (oiData) {
                    return parseFloat(oiData.value);
                } else {
                    console.error(`No OI data found for symbol: ${symbol}`);
                    return null; // If no OI data is found for the symbol
                }
            } else {
                throw new Error(`Invalid data structure or empty response for symbol: ${symbol}`);
            }
        } catch (error) {
            console.error(`Attempt ${attempt + 1} failed: ${error.message}`);
            if (attempt < maxRetries) {
                attempt++;
                console.log(`Retrying... (${attempt}/${maxRetries})`);
                await new Promise(res => setTimeout(res, 2000)); // Delay before retrying
                return await fetchOpenInterest(); // Retry the request
            } else {
                console.error('Max retries reached. Returning null.');
                return null; // Return null if max retries are reached
            }
        }
    };
    return await fetchOpenInterest();
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
        tradeSignal
    };

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'OI', data: OIDataToSend }));
        }
    });

    if (tradeSignal) {
        console.log(tradeSignal);
    }
}

// Calculate the current moon phase
function getCurrentMoonPhase() {
    const currentTime = Date.now();
    const diff = (currentTime - newMoonReferenceDate) % moonCycle;
    return diff / moonCycle;
}

// Broadcast moon phase data and buy/sell signals
async function broadcastMoonPhaseAndSignals() {
    const moonPhase = getCurrentMoonPhase();
    const isNewMoon = moonPhase < 0.5;
    const isFullMoon = moonPhase > 0.5;

    const currentPrice = await getCurrentBTCPrice();
    let tradeSignal = null;

    if (isNewMoon && lastNewMoonPrice && currentPrice < lastNewMoonPrice) {
        tradeSignal = 'SELL';
        lastNewMoonPrice = currentPrice;
    }

    if (isFullMoon && lastFullMoonPrice && currentPrice > lastFullMoonPrice) {
        tradeSignal = 'BUY';
        lastFullMoonPrice = currentPrice;
    }

    const moonData = {
        newMoon: isNewMoon,
        fullMoon: isFullMoon,
        moonPhase,
        tradeSignal
    };

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'moonPhase', data: moonData }));
        }
    });

    if (tradeSignal) {
        lastTradeSignal = tradeSignal;
    }
}

// Fetch the current BTC price from Binance
async function getCurrentBTCPrice() {
    const ticker = await client.prices({ symbol: 'BTCUSDT' });
    return parseFloat(ticker.BTCUSDT);
}

// Fetch and broadcast candlestick data
async function fetchAndBroadcastCandlestickData() {
    try {
        const candles = await client.candles({ symbol: 'BTCUSDT', interval: '1m' });
        const formattedCandles = candles.map(candle => ({
            time: new Date(candle.openTime).getTime() / 1000,
            open: parseFloat(candle.open),
            high: parseFloat(candle.high),
            low: parseFloat(candle.low),
            close: parseFloat(candle.close),
            volume: parseFloat(candle.volume),
        }));
        broadcastData('candles', formattedCandles);
    } catch (error) {
        console.error('Error fetching candlestick data:', error);
    }
}

// Broadcast order book data
async function fetchAndBroadcastOrderBookData() {
    try {
        const orderBook = await client.book({ symbol: 'BTCUSDT' });
        const formattedOrderBook = {
            bids: orderBook.bids.slice(0, 10), // Top 10 bids
            asks: orderBook.asks.slice(0, 10)  // Top 10 asks
        };
        broadcastData('orderBook', formattedOrderBook);
    } catch (error) {
        console.error('Error fetching order book data:', error);
    }
}

// General function to broadcast data
function broadcastData(type, data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type, data }));
        }
    });
}

// Adjust broadcast intervals for efficiency
setInterval(monitorCoinsForOI, 10 * 1000); // Monitor every minute
setInterval(fetchAndBroadcastCandlestickData, 5 * 1000); // Update every 5 seconds
setInterval(fetchAndBroadcastOrderBookData, 5 * 1000); // Update every 5 seconds
setInterval(broadcastMoonPhaseAndSignals, 6 * 1000); // Broadcast moon phase every minute

console.log('Server running on ws://localhost:3000');
