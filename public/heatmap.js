let candlestickData = []; // Stores all candlestick data
let hotZone = null;       // Stores the identified Hot Zone
let H1 = 0;               // Sum of high liquidation total
let L1 = 0;               // Sum of low liquidation total
let chartInstance = null; // Stores the current ApexCharts instance

// Initialize WebSocket connection to server
const socket = new WebSocket('ws://localhost:3000');

socket.onmessage = (event) => {
    const tradeData = JSON.parse(event.data);
    const time = new Date(); // Use the current time for real-time data
    const open = parseFloat(tradeData.o);
    const high = parseFloat(tradeData.h);
    const low = parseFloat(tradeData.l);
    const close = parseFloat(tradeData.c);

    const candlestickZone = { x: time.getTime(), y: [open, high, low, close] };
    candlestickData.push(candlestickZone);

    // Update the sums H1 and L1 based on the current candlestick zone
    updateLiquidationSums(candlestickZone);

    // Identify the Hot Zone (highest quantum of liquidation)
    hotZone = identifyHotZone(candlestickData);

    // Calculate direction bias based on the current closing price
    const directionBias = calculateDirectionBias(close, hotZone);

    // Recommend trading actions
    const recommendation = recommendTradingAction(directionBias);

    // Update the candlestick chart and display recommendations
    updateCandlestickChart(candlestickData);
    displayRecommendations(recommendation, directionBias);
};

// Function to update the sum of liquidations
function updateLiquidationSums(candlestickZone) {
    if (!hotZone) {
        hotZone = candlestickZone;
    }

    if (hotZone && candlestickZone.y[3] >= hotZone.y[3]) { // Use close price (y[3])
        H1 += candlestickZone.y[3];
    } else {
        L1 += candlestickZone.y[3];
    }

    H1 = isNaN(H1) ? 0 : H1;
    L1 = isNaN(L1) ? 0 : L1;
}

// Function to identify the highest quantum of liquidation (Hot Zone)
function identifyHotZone(data) {
    return data.reduce((max, zone) => (max.y[3] > zone.y[3] ? max : zone), data[0]);
}

// Function to calculate direction bias based on the current closing price and Hot Zone
function calculateDirectionBias(currentPrice, hotZone) {
    return hotZone ? hotZone.y[3] - currentPrice : 0;
}

// Function to recommend trading actions based on direction bias
function recommendTradingAction(directionBias) {
    const action = directionBias > 0 ? 'LONG' : 'SHORT';
    const altAction = action === 'LONG' ? 'BUY alts' : 'SELL alts';
    return {
        action: action,
        altAction: altAction,
        targetPrice: hotZone ? hotZone.y[3] : 0
    };
}

// Function to update the candlestick chart
function updateCandlestickChart(data) {
    // Destroy existing chart if it exists
    if (chartInstance) {
        chartInstance.destroy();
    }

    const options = {
        series: [{
            data: data
        }],
        chart: {
            type: 'candlestick',
            height: 400
        },
        title: {
            text: 'BTC/USDT Candlestick Chart',
            align: 'left'
        },
        xaxis: {
            type: 'datetime'
        },
        yaxis: {
            tooltip: {
                enabled: true
            }
        }
    };

    // Create a new ApexCharts instance
    chartInstance = new ApexCharts(document.querySelector("#candlestickChart"), options);
    chartInstance.render();
}

// Function to display trading recommendations and sums
function displayRecommendations(recommendation, directionBias) {
    const recommendationDiv = document.getElementById('recommendations');
    recommendationDiv.innerHTML = `
        <p>Sum of High Liquidation Total (H1): ${H1.toFixed(2)}</p>
        <p>Sum of Low Liquidation Total (L1): ${L1.toFixed(2)}</p>
        <p>Direction Bias: ${directionBias.toFixed(2)} (${recommendation.action})</p>
        <p>Action: ${recommendation.action}</p>
        <p>Altcoins Recommendation: ${recommendation.altAction}</p>
        <p>Target Price: ${recommendation.targetPrice}</p>
    `;
}
