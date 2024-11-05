// cron-job.js
const cron = require('node-cron');
const { fetchAndBroadcastTradeData, broadcastMoonPhaseAndSignals } = require('./algo'); 

const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'AVAXUSDT', 'SUIUSDT', 'SEIUSDT', 'APTUSDT', 'OPUSDT', 'INJUSDT', 'ARBUSDT', 'FETUSDT']; 


const { connectDB } = require('./db');


connectDB().then(() => {

    startTradeDataCronJobs();  
    startMoonPhaseCronJobs();
}).catch(error => {
  console.error('Failed to connect to MongoDB:', error);
  process.exit(1); 
});

function startTradeDataCronJobs() {
    /** Schedule the cron job to run every 60 minutes */
    cron.schedule('0 * * * *', async () => {
        console.log(`Running fetchAndBroadcastTradeData for symbols at ${new Date()}`);
    
        for (const symbol of symbols) {
            try {
                console.log(`Fetching and broadcasting trade data for symbol: ${symbol}`);
                await fetchAndBroadcastTradeData(symbol);
                console.log(`Successfully executed fetchAndBroadcastTradeData for ${symbol}`);
            } catch (error) {
                console.error(`Error executing fetchAndBroadcastTradeData for ${symbol}:`, error);
            }
        }
    });
}

function startMoonPhaseCronJobs() {
    /** Schedule the cron job to run every 60 minutes */
    cron.schedule('0 * * * *', async () => {
        console.log(`Running fetchAndBroadcastTradeData for symbols at ${new Date()}`);
    
        for (const symbol of symbols) {
            try {
                console.log(`Fetching moon phase data for symbol: ${symbol}`);
                await broadcastMoonPhaseAndSignals(symbol);
                console.log(`Successfully executed broadcastMoonPhaseAndSignals for ${symbol}`);
            } catch (error) {
                console.error(`Error executing broadcastMoonPhaseAndSignals for ${symbol}:`, error);
            }
        }
    });
}
