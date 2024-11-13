const axios = require('axios');
const { connectDB, getDB } = require('./../database/db');

// Dune API URL and API key
const DUNE_API_URL = 'https://api.dune.com/api/';
const DUNE_API_KEY = 'QXBhbSq6WuPtvtc7eChHIUwpDnuL5run';
const MURAD_WALLET_QUERY = 'v1/query/4143247/results?limit=1000';
const PROFITABLE_BOT_WALLETS = 'v1/query/4216808/results?limit=10';
const WALLET_ANALYSIS = 'v1/query/4228640/results?limit=1000';

// Function to call the Dune API
async function callApi(query) {
    try {
      const response = await axios.get(`${DUNE_API_URL}${query}`, {
        headers: { 'x-dune-api-key': DUNE_API_KEY }
      });
      return response.data;
    } catch (error) {
      console.error('Error calling Dune API:', error);
    }
  }
  
  
  // Function to check Murad's transactions
  async function checkProfitableBotWallets() {
    try {
      const data = await callApi(PROFITABLE_BOT_WALLETS);
      if (data && data.result && data.result.rows) {
        const transactions = data.result.rows;
        transactions.forEach(async transaction => {
          const { user } = transaction;
          await checkWalletAnalysis(user);
        });
      }
      console.log('No transactions found.');
    } catch (error) {
      console.error('Error fetching data from Dune API:', error);
    }
  }
  async function checkWalletAnalysis(wallet_address) {
    try {
      if (!getDB()) {
        await connectDB();
      }
      let signal = "";
      const db = getDB();
      const data = await callApi(WALLET_ANALYSIS + "&wallet_address=" + wallet_address);
      if (data && data.result && data.result.rows) {
        const transactions = data.result.rows;
        transactions.forEach(async transaction => {
          const { asset } = transaction;
          const { sell } = transaction;
          const { token_address } = transaction;
          const { token_balance } = transaction;
          const { buy } = transaction;
          const { total_pnl } = transaction;
          const profitableWallet
          = await db.collection(`profitable-wallets`).findOne({ wallet_address,  token_address});
          
          if(!profitableWallet && !sell) {
            signal = `${wallet_address} is holding ${token_balance} ${asset} at price $ ${buy} and contract addres ${token_address}`;
            await db.collection('profitable-wallets').insertOne({ wallet_address, token_address, signal, createdTimeStamp: new Date(), updatedTimeStamp: new Date(), rawData: transaction});
          }
          else if (profitableWallet && (!profitableWallet.rawData.sell) && sell) {
            signal = `${wallet_address} sold ${asset} : contract Address ${token_address} at price $ ${sell} and get profit ${total_pnl}`;
            await db.collection('profitable-wallets').updateOne(
              { wallet_address, token_address }, // Filter to find the document
              { 
                $set: { 
                  signal, 
                  updatedTimeStamp: new Date(), 
                  rawData: transaction 
                } 
              },
              { upsert: true } // Create a new document if no match is found
            );
          }
          console.log(signal);
        });
      }
      console.log('No transactions found.');
    } catch (error) {
      console.error('Error fetching data from Dune API:', error);
    }
  }
  // Function to check Murad's transactions
  async function checkMuradTransactions() {
    try {
      const data = await callApi(MURAD_WALLET_QUERY);
      if (data && data.result && data.result.rows) {
        const transactions = data.result.rows;
        const groupedData = {};
  
        transactions.forEach(transaction => {
          const { amount } = transaction;
          const { symbol } = transaction;
          const { direction } = transaction;
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
        const json = [];
  
        for (const symbol in groupedData) {
          const { buyTotal, sellTotal } = groupedData[symbol];
          json.push(`Notification: For ${symbol}, total bought: ${buyTotal}, total sold: ${sellTotal}`);
        }
        const muradData = {
          exchange: 'Dune',
          symbol: 'sol',
          options: JSON.stringify(json || {}),
          strategy: 'MuradWallet',
          income_at: Math.floor(Date.now() / 1000)
        };
        return muradData;
      }
      console.log('No transactions found.');
    } catch (error) {
      console.error('Error fetching data from Dune API:', error);
    }
    return [];
  }
  async function getAssetsWalletCount() {
    try {
      if (!getDB()) {
        await connectDB();
      }
      const db = getDB();
      var groupedData = await  db.collection("profitable-wallets").aggregate([
        {
          "$group": {
            "_id": "$rawData.asset",              // Group by the asset name
            "total_balance": { "$sum": "$rawData.token_balance" },  // Sum up the balances
            "total_buy": { "$sum": "$rawData.buy" },                // Sum up buy prices
            "average_buy": { "$avg": "$rawData.buy" },              // Average buy price
            "wallets": { "$push": "$wallet_address" }               // Array of wallet addresses holding this asset
          }
        }
      ]);

      console.log(groupedData);
      


    } catch (error) {
      console.error('Error fetching data from Dune API:', error);
    }
    
  }
  module.exports = { checkMuradTransactions, checkProfitableBotWallets, getAssetsWalletCount };
