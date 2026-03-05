const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('../models/User');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.');

  const users = await User.find({});
  console.log('--- USERS ---');
  users.forEach(u => {
    console.log(`${u.employeeId} | ${u.fullName} | ${u.email} | ${u.role}`);
  });
  console.log('-------------');
  
  await mongoose.disconnect();
}

run().catch(console.error);