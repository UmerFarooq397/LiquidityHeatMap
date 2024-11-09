// db.js
const { MongoClient } = require('mongodb');

// MongoDB connection URL and database name
const uri = 'mongodb+srv://bae-test-user:bS9l5vgBwiICtL6P@cluster-test.slrqv.mongodb.net/bae-data?retryWrites=true&w=majority&appName=cluster-test'; // Replace with your MongoDB URI if needed
const dbName = 'bae-data'; // Replace with your database name

// Initialize MongoClient
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

let db;

const connectDB = async () => {
    try {
        // Connect the client to the server
        await client.connect();
        console.log('Connected successfully to MongoDB');
        
        // Specify database to use
        db = client.db();
    } catch (error) {
        console.error('MongoDB connection failed:', error);
        process.exit(1); // Exit process with failure
    }
};

// Get the database instance
const getDB = () => {
    if (!db) throw new Error('Database not initialized');
    return db;
};

module.exports = { connectDB, getDB };
