const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/prophr', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const resetAdmin = async () => {
  try {
    const admin = await User.findOne({ email: 'admin@propninja.com' });
    if (admin) {
      admin.password = 'admin123'; // Triggers pre-save hash
      await admin.save();
      console.log('Admin password reset to: admin123');
    } else {
      console.log('Admin not found');
    }
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

resetAdmin();
