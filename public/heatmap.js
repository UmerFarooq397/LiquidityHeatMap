const ctx = document.getElementById('heatmap').getContext('2d');
let liquidationData = [];  // Stores all liquidation data
let hotZone = null;        // Stores the identified Hot Zone
let H1 = 0;                // Sum of high liquidation total
let L1 = 0;                // Sum of low liquidation total
let chartInstance = null;  // Stores the current Chart.js instance

// Initialize WebSocket connection to server
const socket = new WebSocket('ws://localhost:3000');

socket.onmessage = (event) => {
    const tradeData = JSON.parse(event.data);
    const price = parseFloat(tradeData.p);
    const intensity = parseFloat(tradeData.i);
    const liquidationZone = { price, intensity };
    liquidationData.push(liquidationZone);

    // Update the sums H1 and L1 based on the current liquidation zone
    updateLiquidationSums(liquidationZone);

    // Identify the Hot Zone (highest quantum of liquidation)
    hotZone = identifyHotZone(liquidationData);

    // Calculate direction bias based on current price
    const directionBias = calculateDirectionBias(price, hotZone);

    // Recommend trading actions
    const recommendation = recommendTradingAction(directionBias);

    // Update the heatmap and display recommendations
    updateHeatmap(liquidationData);
    displayRecommendations(recommendation, directionBias);
};

// Function to update the sum of liquidations
function updateLiquidationSums(liquidationZone) {
    if (!hotZone) {
        // If hotZone is not defined, initialize it
        hotZone = liquidationZone;
    }

    if (hotZone && liquidationZone.price >= hotZone.price) {
        // Update H1 if the current liquidation zone's price is higher or equal to the hotZone price
        H1 += liquidationZone.intensity;
    } else {
        // Update L1 otherwise
        L1 += liquidationZone.intensity;
    }

    // Ensure H1 and L1 are valid numbers
    H1 = isNaN(H1) ? 0 : H1;
    L1 = isNaN(L1) ? 0 : L1;
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
function recommendTradingAction(directionBias) {
    const action = directionBias > 0 ? 'LONG' : 'SHORT';
    const altAction = action === 'LONG' ? 'BUY alts' : 'SELL alts';
    return {
        action: action,
        altAction: altAction,
        targetPrice: hotZone ? hotZone.price : 0
    };
}

// Function to update the heatmap
function updateHeatmap(data) {
    // Destroy existing chart if it exists
    if (chartInstance) {
        chartInstance.destroy();
    }

    const heatmapData = {
        datasets: [{
            label: 'BTC/USDT Liquidation Heatmap',
            data: data.map(d => ({ x: d.intensity, y: d.price })),
            backgroundColor: 'rgba(255, 99, 132, 0.6)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1,
            pointRadius: 3
        }]
    };

    // Create a new chart instance
    chartInstance = new Chart(ctx, {
        type: 'scatter',
        data: heatmapData,
        options: {
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Liquidation Intensity'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Price'
                    }
                }
            }
        }
    });
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
