const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    
    // Fallback to local file system if MongoDB connection fails
    console.warn('Using local file system as fallback');
    
    // Don't exit process, allow fallback to file system
    // process.exit(1);
  }
};

module.exports = connectDB;
