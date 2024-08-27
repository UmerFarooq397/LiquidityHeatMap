const WebSocket = require('ws');
const Binance = require('binance-api-node').default;

// Create a WebSocket server
const wss = new WebSocket.Server({ port: 3000 });
const client = Binance();

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
async function fetchAndBroadcastTradeData() {
    try {
        const trades = await client.trades({ symbol: 'BTCUSDT', limit: 1 });
        if (trades.length > 0) {
            const latestTrade = trades[0];
            const orderBookDepth = await getOrderBookDepth('BTCUSDT');
            const intensity = calculateIntensity(orderBookDepth, parseFloat(latestTrade.price));
            broadcastTradeData(parseFloat(latestTrade.price), intensity);
        }
    } catch (error) {
        console.error('Error fetching trade data:', error);
    }
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
    const priceLevel = bidVolume > askVolume
        ? (orderBookDepth.bids[0] ? parseFloat(orderBookDepth.bids[0].price) : price)
        : (orderBookDepth.asks[0] ? parseFloat(orderBookDepth.asks[0].price) : price);

    // Calculate intensity based on total volume and price difference
    return totalVolume * Math.abs(price - priceLevel);
}



// Fetch and broadcast trade data every 2 seconds
setInterval(fetchAndBroadcastTradeData, 2000);

console.log('WebSocket server running on ws://localhost:3000');
