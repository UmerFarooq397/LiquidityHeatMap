// cron-job.js
const cron = require('node-cron');
const { fetchAndBroadcastTradeData, broadcastMoonPhaseAndSignals } = require('./algos/trade-moon-phase'); 
const { checkProfitableBotWallets, checkMuradTransactions, getAssetsWalletCount,checkMuradHoldings } = require('./algos/dunelogic'); 
const { monitorCoinsForOI } = require('./algos/openinterset'); 

// const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'AVAXUSDT', 'SUIUSDT', 'SEIUSDT', 'APTUSDT', 'OPUSDT', 'INJUSDT', 'ARBUSDT', 'FETUSDT']; 
const symbols = ['BTCUSDT']; 


const { connectDB } = require('./database/db');

connectDB().then(() => {
    // startOpenIntersetCronJobs();
    // startProfitableWalletJobs();
    // startTradeDataCronJobs();
    // startMoonPhaseCronJobs();

    // checkProfitableBotWallets();
    // checkMuradTransactions();
    // getAssetsWalletCount();
    // checkMuradHoldings();
    monitorCoinsForOI()

}).catch(error => {
  console.error('Failed to connect to MongoDB:', error);
  process.exit(1); 
});

function startOpenIntersetCronJobs() {
    /** Schedule the cron job to run every day */
    cron.schedule('0 0 * * *', async () => {
        console.log(`Running monitorCoinsForOI for symbols at ${new Date()}`);
        try {
            console.log(`Fetching and broadcasting Open interset for symbol: BTC`);
            await monitorCoinsForOI();
            console.log(`Successfully executed monitorCoinsForOI for BTC`);
        } catch (error) {
            console.error(`Error executing monitorCoinsForOI for BTC:`, error);
        }
    });
}
function startTradeDataCronJobs() {
    /** Schedule the cron job to run every day */
    cron.schedule('0 0 * * *', async () => {
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
    /** Schedule the cron job to run every day */
    cron.schedule('0 0 * * *', async () => {
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

function startProfitableWalletJobs() {
    /** Schedule the cron job to run every day */
    cron.schedule('0 0 * * *', async () => {
        console.log(`Running checkProfitableBotWallets for symbols at ${new Date()}`);
        try {
            console.log(`Fetching wallet profitable data for symbol: sol`);
            await checkProfitableBotWallets();
            console.log(`Successfully executed checkProfitableBotWallets for sol`);
        } catch (error) {
            console.error(`Error executing checkProfitableBotWallets for sol:`, error);
        }
    });
}
