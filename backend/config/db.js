const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const raw = process.env.MONGO_URI;
    const uri = raw ? String(raw).trim().replace(/^['"`]+|['"`]+$/g, '') : '';
    if (!uri) {
      throw new Error('Missing MONGO_URI');
    }

    const conn = await mongoose.connect(uri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    const hint = /URI malformed/i.test(String(error && error.message))
      ? ' (check URL-encoding for special characters in your MongoDB password; e.g. "@" => "%40", "%" => "%25")'
      : '';
    console.error(`Error: ${error.message}${hint}`);
    throw error;
  }
};

module.exports = connectDB;
