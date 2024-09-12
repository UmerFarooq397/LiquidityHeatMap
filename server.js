const WebSocket = require('ws');
const Binance = require('binance-api-node').default;

const wss = new WebSocket.Server({ port: 3000 });
const client = Binance();

// Moon phase strategy variables
const newMoonReferenceDate = new Date('2021-01-13T05:00:00Z').getTime();
const moonCycle = 2551442876.8992; // Lunar cycle duration in milliseconds

let lastNewMoonPrice = null;
let lastFullMoonPrice = null;
let currentNewMoonPrice = null;
let currentFullMoonPrice = null;

let lastTradeSignal = null; // To store the last trade action (BUY/SELL)

// Calculate the current moon phase (0 for New Moon, 1 for Full Moon)
function getCurrentMoonPhase() {
    const currentTime = Date.now();
    const diff = (currentTime - newMoonReferenceDate) % moonCycle;
    return diff / moonCycle;
}

// Broadcast moon phase data and buy/sell signals to all connected clients
async function broadcastMoonPhaseAndSignals() {
    const moonPhase = getCurrentMoonPhase();
    const isNewMoon = moonPhase < 0.5;
    const isFullMoon = moonPhase > 0.5;

    const currentPrice = await getCurrentBTCPrice();

    let tradeSignal = null;
    
    if (isNewMoon) {
        if (lastNewMoonPrice && currentNewMoonPrice && currentPrice < lastNewMoonPrice) {
            tradeSignal = 'SELL';
        }
        lastNewMoonPrice = currentNewMoonPrice;
        currentNewMoonPrice = currentPrice;
    }

    if (isFullMoon) {
        if (lastFullMoonPrice && currentFullMoonPrice && currentPrice > lastFullMoonPrice) {
            tradeSignal = 'BUY';
        }
        lastFullMoonPrice = currentFullMoonPrice;
        currentFullMoonPrice = currentPrice;
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

    // Save last trade signal
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

// Broadcast order book data to clients
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

// Broadcast data every second
setInterval(fetchAndBroadcastCandlestickData, 1000); // Update every second
setInterval(fetchAndBroadcastOrderBookData, 1000); // Update every second
setInterval(broadcastMoonPhaseAndSignals, 1000); // Broadcast moon phase and signals every second

console.log('Server running on ws://localhost:3000');
