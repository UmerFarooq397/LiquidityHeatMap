const axios = require('axios');
const dayjs = require('dayjs');

// Coinglass API credentials and endpoint (replace with actual data)
const COINGLASS_API_KEY = 'your_coinglass_api_key';
const COINGLASS_LIQUIDATION_URL = 'https://api.coinglass.com/v3/liquidation_data'; // Placeholder URL

// Coinalyze API URL for OI (replace with actual data)
const COINALYZE_OI_URL = 'https://coinalyze.net/api/oi'; // Placeholder URL

// Helper function to fetch data from Coinglass API
async function fetchLiquidationData() {
  try {
    const response = await axios.get(COINGLASS_LIQUIDATION_URL, {
      headers: {
        'Authorization': `Bearer ${COINGLASS_API_KEY}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching liquidation data:', error);
  }
}

// Helper function to fetch OI data from Coinalyze API
async function fetchOpenInterestData() {
  try {
    const response = await axios.get(COINALYZE_OI_URL);
    return response.data;
  } catch (error) {
    console.error('Error fetching open interest data:', error);
  }
}

// Function to calculate directional bias
function calculateDirectionalBias(liquidationData, currentPrice) {
  // Assume liquidationData is an array of liquidation zones
  let closestHotZone = null;
  let minDistance = Infinity;

  liquidationData.forEach(zone => {
    const distance = Math.abs(zone.price - currentPrice);
    if (distance < minDistance) {
      closestHotZone = zone;
      minDistance = distance;
    }
  });

  const directionBias = closestHotZone.price - currentPrice;
  return {
    directionBias,
    isLong: directionBias > 0,
    isShort: directionBias < 0
  };
}

// Function to analyze OI peaks and recommend actions
function analyzeOI(oiData, currentOI) {
  const OI_peak = 50000; // Example peak threshold
  const OI_bottom = 10000; // Example bottom threshold

  if (currentOI > OI_peak) {
    return 'Close Longs';
  }
  if (currentOI < OI_bottom) {
    return 'Open Longs';
  }
  return 'Hold Position';
}

// Main function to execute the strategy
async function executeStrategy() {
  const liquidationData = await fetchLiquidationData();
  const oiData = await fetchOpenInterestData();

  const currentPrice = 60000; // Placeholder for current BTC price
  const currentOI = 45000; // Placeholder for current OI from Coinalyze

  // Calculate directional bias based on liquidation data
  const { directionBias, isLong, isShort } = calculateDirectionalBias(liquidationData, currentPrice);

  // Analyze OI to recommend long/short
  const oiRecommendation = analyzeOI(oiData, currentOI);

  console.log('Directional Bias:', directionBias);
  console.log('Is Long:', isLong);
  console.log('Is Short:', isShort);
  console.log('OI Recommendation:', oiRecommendation);

  if (isLong) {
    console.log('Recommendation: Go Long');
  } else if (isShort) {
    console.log('Recommendation: Go Short');
  }
}

// Execute the strategy
executeStrategy();
