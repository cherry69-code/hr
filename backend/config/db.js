const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const raw = process.env.MONGO_URI;
    const uri = raw ? String(raw).trim().replace(/[`"' \t\r\n]/g, '') : '';
    if (!uri) {
      throw new Error('Missing MONGO_URI');
    }

    const conn = await mongoose.connect(uri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    const msg = String(error && error.message ? error.message : '');
    const hint = /URI malformed/i.test(msg)
      ? ' (check URL-encoding for special characters in your MongoDB password; e.g. "@" => "%40", "%" => "%25")'
      : /bad auth|authentication failed/i.test(msg)
        ? ' (check MongoDB username/password in MONGO_URI and ensure the DB user exists in Atlas Database Access)'
        : '';
    console.error(`Error: ${error.message}${hint}`);
    throw error;
  }
};

module.exports = connectDB;
