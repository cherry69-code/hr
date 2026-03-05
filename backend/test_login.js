const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

// Load env vars
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const testLogin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected...');

    const email = 'admin@propninja.com';
    const password = 'Casper@123';

    console.log(`Attempting to find user: ${email}`);
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      console.log('User not found!');
      process.exit(1);
    }

    console.log(`User found: ${user.fullName} (${user.role})`);
    console.log(`Stored Hashed Password: ${user.password}`);

    console.log(`Comparing with password: ${password}`);
    const isMatch = await user.matchPassword(password);

    if (isMatch) {
      console.log('SUCCESS: Password matches!');
    } else {
      console.log('FAILURE: Password does NOT match!');
      
      // Attempt manual hash check to debug
      const salt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash(password, salt);
      console.log(`If we hashed '${password}' now, it would look like: ${newHash}`);
    }

    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

testLogin();
