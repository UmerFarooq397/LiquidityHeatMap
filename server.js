const WebSocket = require('ws');
const Binance = require('binance-api-node').default;

// Create a WebSocket server
const wss = new WebSocket.Server({ port: 3000 });
const client = Binance();

// Broadcast trade data to all connected clients
function broadcastTradeData(open, high, low, close) {
    const tradeData = JSON.stringify({ o: open, h: high, l: low, c: close });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(tradeData);
        }
    });
}

// Fetch candlestick data from Binance
async function fetchAndBroadcastCandlestickData() {
    try {
        const candles = await client.candles({ symbol: 'BTCUSDT', interval: '1m', limit: 1 });
        if (candles.length > 0) {
            const latestCandle = candles[0];
            const open = parseFloat(latestCandle.open);
            const high = parseFloat(latestCandle.high);
            const low = parseFloat(latestCandle.low);
            const close = parseFloat(latestCandle.close);
            broadcastTradeData(open, high, low, close);
        }
    } catch (error) {
        console.error('Error fetching candlestick data:', error);
    }
}

// Fetch and broadcast candlestick data every 2 seconds
setInterval(fetchAndBroadcastCandlestickData, 2000);

console.log('WebSocket server running on ws://localhost:3000');
