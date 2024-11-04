const axios = require('axios');

// Dune API URL and API key
const DUNE_API_URL = 'https://api.dune.com/api/';
const DUNE_API_KEY = 'QXBhbSq6WuPtvtc7eChHIUwpDnuL5run';//'pIMmmOd73SJ5GEJIOneP5arv7lco1JIc';
const MURAD_WALLET_QUERY = 'v1/query/4143247/results?limit=1000';
const TROJAN_ALPHA_WALLETS_QUERY = 'v1/query/3605798/results?limit=1000';

// Function to send a notification
function sendNotification(symbol, buyTotal, sellTotal) {
    console.log(`Notification: For ${symbol}, total bought: ${buyTotal}, total sold: ${sellTotal}`);
}

async function checkMuradTransactions() {
    try {
        const data = await callApi(MURAD_WALLET_QUERY);
        if (data && data.result && data.result.rows) {
            const transactions = data.result.rows;
            const groupedData = {};

            transactions.forEach((transaction) => {
                const amount = transaction.amount;
                const symbol = transaction.symbol;
                const direction = transaction.direction;
                if (!groupedData[symbol]) {
                    groupedData[symbol] = {
                        buyTotal: 0,
                        sellTotal: 0
                    };
                }
                if (direction === 'sell') {
                    groupedData[symbol].sellTotal += amount;
                } else if (direction === 'buy') {
                    groupedData[symbol].buyTotal += amount;
                }
            });

            for (const symbol in groupedData) {
                const { buyTotal, sellTotal } = groupedData[symbol];
                sendNotification(symbol, buyTotal, sellTotal);
            }
        } else {
            console.log('No transactions found.');
        }
        
    } catch (error) {
        console.error('Error fetching data from Dune API:', error);
    }
}

async function checkTrojanAlphaWallets() {
    try {
        const data = await callApi(TROJAN_ALPHA_WALLETS_QUERY); // Await the API call
        if (data && data.result && data.result.rows) {
            const transactions = data.result.rows;
            const groupedData = {};

            transactions.forEach((transaction) => {
                console.log(transaction); // Log each transaction
            });

        } else {
            console.log('No transactions found.');
        }
        
    } catch (error) {
        console.error('Error fetching data from Dune API:', error);
    }
}

async function callApi(query) {
    try {
        const response = await axios.get(DUNE_API_URL + query, {
            headers: {
                'X-Dune-API-Key': DUNE_API_KEY
            }
        });

        return response.data; // Return API data
    } catch (error) {
        console.error('Error in API call:', error);
        throw error; // Throw error to handle it in the calling function
    }
}

// Call the function
checkTrojanAlphaWallets();
//checkMuradTransactions();