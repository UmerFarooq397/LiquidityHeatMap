const axios = require('axios');
const { connectDB, getDB } = require('./../database/db');

// Dune API URL and API key
const DUNE_API_URL = 'https://api.dune.com/api/';
const DUNE_API_KEY = 'QXBhbSq6WuPtvtc7eChHIUwpDnuL5run';
const MURAD_WALLET_QUERY = 'v1/query/4143247/results?limit=1000';
const PROFITABLE_BOT_WALLETS = 'v1/query/4216808/results?limit=10';
const WALLET_ANALYSIS = 'v1/query/4228640/results?limit=1000';
const MURAD_WALLET_HOLDING_QUERY = 'v1/query/4146528/results?limit=1000';

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
            signal = `${wallet_address} is holding ${token_balance} ${asset} at price $ ${buy} and contract address ${token_address}`;
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
        if (!getDB()) {
        await connectDB();
      }
      const data = await callApi(MURAD_WALLET_QUERY);
      if (data && data.result && data.result.rows) {
        const transactions = data.result.rows;
        const groupedData = {};
          const db = getDB();
        
        transactions.forEach(async (transaction) => {
          
          const { amount, symbol, direction } = transaction;

          // const profitableWallet = await db.collection(`profitable-wallets`).findOne({ wallet_address,  token_address});
          if (!groupedData[symbol]) {
            groupedData[symbol] = {
              buyTotal: 0,
              sellTotal: 0
            };
          }

          if (direction === 'sell') {
            groupedData[symbol].sellTotal += amount;
            // await db.collection('murad-wallets').insertOne()
          } else if (direction === 'buy') {
            groupedData[symbol].buyTotal += amount;

          }

        });
        const json = [];
  
        for (const symbol in groupedData) {
          
          const { buyTotal, sellTotal } = groupedData[symbol];
          const notificationMessage = `Notification: For ${symbol}, total bought: ${buyTotal}, total sold: ${sellTotal}`
          json.push(notificationMessage);

          const muradFound = await db.collection('murad-wallets').findOne({ symbol: symbol, buyTotal: buyTotal, sellTotal: sellTotal });
          
          if (!muradFound) {
            await db.collection('murad-wallets').insertOne({
              buyTotal: buyTotal, sellTotal: sellTotal,
              createdTimeStamp: new Date(),
              notificationMessage: notificationMessage,
              symbol: symbol
            })
          }

        }
      }
      console.log('No transactions found.');
    } catch (error) {
      console.error('Error fetching data from Dune API:', error);
    }
    return [];
  }

  // Function to check Murad's Holdings
  async function checkMuradHoldings() {
    try {

      if (!getDB()) {
        await connectDB();
      }

      const data = await callApi(MURAD_WALLET_HOLDING_QUERY);
      if (data && data.result && data.result.rows) {
        const transactions = data.result.rows;
  
        const db = getDB();
  
        transactions.forEach(async(transaction) => {
          // console.log(transaction);
          const muradHoldingFound = await db.collection('murad-holdings').findOne({symbol: transaction.symbol, Amount: transaction.Amount, Blockchain: transaction.Blockchain});
          
          if (!muradHoldingFound) {
            await db.collection('murad-holdings').insertOne({...transaction, createdTimeStamp: new Date()})
          }
        });
      }
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
      const groupedData = await db.collection("profitable-wallets").aggregate([
        {
      $match: {
      // updatedTimeStamp: new Date(),  
      "rawData.sell": null         
    }
  },
  {
    $group: {
      _id: "$rawData.asset",
      wallet_address: { $addToSet: "$wallet_address" }
    }
  },
  {
    $addFields: {
      totalWallets: { $size: "$wallet_address" }
    }
  },
  {
    $sort: { _id: 1 }
  },
  {
    $group: {
      _id: null,
      assets: { $push: "$$ROOT" },
      totalOfTotalWallets: { $sum: "$totalWallets" }
    }
  },
  {
    $addFields: {
      assets: {
        $map: {
          input: "$assets",
          as: "asset",
          in: {
            $mergeObjects: [
              "$$asset",
              {
                percentage: {
                  $multiply: [
                    { $divide: ["$$asset.totalWallets", "$totalOfTotalWallets"] },
                    100
                  ]
                }
              }
            ]
          }
        }
      }
    }
  },
  {
    $project: {
      _id: 0,
      assets: 1,
      totalOfTotalWallets: 1
    }
  }
      ]).toArray();


      await db.collection('wallet-assets').insertMany(groupedData[0]?.assets.map(asset => {
        const assetName = asset._id;
        delete asset._id;
        return { ...asset, asset: assetName, createdTimeStamp: new Date() }
      }));
    

    } catch (error) {
      console.error('Error fetching data from Dune API:', error);
    }
    
  }
  module.exports = { checkMuradTransactions, checkProfitableBotWallets, checkMuradHoldings, getAssetsWalletCount };
