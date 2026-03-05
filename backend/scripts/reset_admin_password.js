const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');

const email = process.argv[2] || 'admin@propninja.com';
const newPassword = process.argv[3] || 'Admin@123';

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('Missing MONGO_URI in environment');
    process.exit(1);
  }
  console.log('Connecting to DB...');
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('Connected.');

  let user = await User.findOne({ email });
    if (!user) {
    console.log('Admin user not found, creating one...');
    user = new User({
      fullName: 'Administrator',
      email,
      role: 'admin',
      employeeId: 'NINJA001', // Force ID to avoid collision
      password: newPassword,
      status: 'active',
    });
  } else {
    console.log('Updating password for existing admin...');
    user.password = newPassword;
  }

  await user.save();
  console.log(`Password reset OK for ${email}`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
