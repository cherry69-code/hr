const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Department = require('./models/Department');

dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/prophr', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const check = async () => {
  try {
    const depts = await Department.find();
    console.log('Departments:', depts.map(d => d.name));

    const managers = await User.find({ role: { $in: ['manager', 'admin'] } }).select('fullName role email');
    console.log('Managers:', managers);

    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

check();
