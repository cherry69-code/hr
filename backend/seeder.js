const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Department = require('./models/Department');
const Location = require('./models/Location');

const Team = require('./models/Team');

// Load env vars
dotenv.config();

// Connect to DB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/prophr', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const getEnv = (key, fallback) => (process.env[key] !== undefined ? process.env[key] : fallback);

const parseArgs = () => {
  const args = new Set(process.argv.slice(2));
  return {
    wipe: args.has('--wipe')
  };
};

const importData = async () => {
  try {
    const { wipe } = parseArgs();

    if (wipe) {
      await Promise.all([
        User.deleteMany({}),
        Department.deleteMany({}),
        Location.deleteMany({}),
        Team.deleteMany({})
      ]);
      console.log('Database wiped: users, departments, locations, teams');
    }

    const adminEmail = getEnv('SEED_ADMIN_EMAIL', 'admin@propninja.com');
    const adminPassword = getEnv('SEED_ADMIN_PASSWORD', 'admin123');
    const hrEmail = getEnv('SEED_HR_EMAIL', 'hr@propninja.com');
    const hrPassword = getEnv('SEED_HR_PASSWORD', 'hr12345');
    const employeeEmail = getEnv('SEED_EMPLOYEE_EMAIL', 'employee@propninja.com');
    const employeePassword = getEnv('SEED_EMPLOYEE_PASSWORD', 'employee123');

    // Create departments
    const departments = ['Human Resources', 'Sales', 'Marketing', 'Accounts', 'IT', 'Operations'];
    const deptMap = {};

    for (const deptName of departments) {
      let dept = await Department.findOne({ name: deptName });
      if (!dept) {
        dept = await Department.create({
          name: deptName,
          description: `${deptName} Department`
        });
        console.log(`${deptName} Department created`);
      }
      deptMap[deptName] = dept;
    }

    // Default department for initial users
    let department = deptMap['Human Resources'];

    // Create Admin User
    const admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      await User.create({
        fullName: 'PropNinja Admin',
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
        level: 'PnL', // Give Admin a high level for visibility
        departmentId: department._id,
        designation: 'System Admin',
        status: 'active',
        joiningDate: new Date()
      });
      console.log(`Admin User Created: ${adminEmail}`);
    } else {
      // Ensure existing admin has level PnL
      if (!admin.level || admin.level === 'N0') {
        admin.level = 'PnL';
        await admin.save();
      }
      console.log('Admin user already exists.');
    }

    // Create HR User
    const hr = await User.findOne({ email: hrEmail });
    if (!hr) {
      await User.create({
        fullName: 'PropNinja HR',
        email: hrEmail,
        password: hrPassword,
        role: 'hr',
        departmentId: department._id,
        designation: 'HR Executive',
        status: 'active',
        joiningDate: new Date()
      });
      console.log(`HR User Created: ${hrEmail}`);
    } else {
      console.log('HR user already exists.');
    }

    // Create Employee User
    const employeeExists = await User.findOne({ email: employeeEmail });
    if (!employeeExists) {
      await User.create({
        fullName: 'John Doe',
        email: employeeEmail,
        password: employeePassword,
        role: 'employee',
        departmentId: department._id,
        designation: 'Software Engineer',
        status: 'active',
        joiningDate: new Date(),
        salary: { ctc: 1200000 }
      });
      console.log(`Employee User Created: ${employeeEmail}`);
    } else {
      const { decryptField } = require('./utils/fieldCrypto');
      const existingCtc = Number(decryptField(employeeExists?.salary?.ctc ?? 0) || 0);
      if (!employeeExists.salary || existingCtc === 0) {
        employeeExists.salary = { ...(employeeExists.salary || {}), ctc: 1200000 };
        await employeeExists.save();
        console.log('Employee CTC initialized');
      }
      console.log('Employee user already exists.');
    }

    /*
    const hasAnyLocation = await Location.countDocuments();
    if (!hasAnyLocation) {
      await Location.create({
        name: 'PropNinja HQ',
        latitude: 12.9716,
        longitude: 77.5946,
        radius: 20,
        active: true
      });
      console.log('Default Location Created: PropNinja HQ');
    }
    */

    // Create Hierarchy: PnL -> N3 -> N2 -> N1 -> N0
    let pnlHead = await User.findOne({ email: 'pnl1@propninja.com' });
    if (!pnlHead) {
      pnlHead = await User.create({
        fullName: 'PnL Head (Sales 1)',
        email: 'pnl1@propninja.com',
        password: 'password123',
        role: 'manager',
        level: 'PnL',
        designation: 'Business Head',
        departmentId: deptMap['Sales']?._id || department._id,
        status: 'active'
      });
      console.log('PnL Head 1 Created');
    }

    // Create Sales Team 1
    let salesTeam1 = await Team.findOne({ name: 'Sales Team 1' });
    if (!salesTeam1 && pnlHead) {
      salesTeam1 = await Team.create({
        name: 'Sales Team 1',
        pnlHeadId: pnlHead._id,
        description: 'Primary Sales Team'
      });
      console.log('Sales Team 1 Created');
      
      pnlHead.teamId = salesTeam1._id;
      await pnlHead.save();
    }
    
    let n3Manager = await User.findOne({ email: 'n3@propninja.com' });
    if (!n3Manager && pnlHead && salesTeam1) {
      n3Manager = await User.create({
        fullName: 'N3 Director',
        email: 'n3@propninja.com',
        password: 'password123',
        role: 'manager',
        level: 'N3',
        designation: 'Director',
        departmentId: deptMap['Sales']?._id || department._id,
        reportingManagerId: pnlHead._id,
        teamId: salesTeam1._id,
        status: 'active'
      });
      console.log('N3 Director Created');
    }

    let n2Manager = await User.findOne({ email: 'n2@propninja.com' });
    if (!n2Manager && n3Manager && salesTeam1) {
      n2Manager = await User.create({
        fullName: 'N2 Senior Manager',
        email: 'n2@propninja.com',
        password: 'password123',
        role: 'manager',
        level: 'N2',
        designation: 'Senior Manager',
        departmentId: deptMap['Sales']?._id || department._id,
        reportingManagerId: n3Manager._id,
        teamId: salesTeam1._id,
        status: 'active'
      });
      console.log('N2 Senior Manager Created');
    }

    let n1Manager = await User.findOne({ email: 'n1@propninja.com' });
    if (!n1Manager && n2Manager && salesTeam1) {
      n1Manager = await User.create({
        fullName: 'N1 Manager',
        email: 'n1@propninja.com',
        password: 'password123',
        role: 'manager',
        level: 'N1',
        designation: 'Manager',
        departmentId: deptMap['Sales']?._id || department._id,
        reportingManagerId: n2Manager._id,
        teamId: salesTeam1._id,
        status: 'active'
      });
      console.log('N1 Manager Created');
    }

    // Create Sales Team 2 & PnL 2
    let pnlHead2 = await User.findOne({ email: 'pnl2@propninja.com' });
    if (!pnlHead2) {
      pnlHead2 = await User.create({
        fullName: 'PnL Head (Sales 2)',
        email: 'pnl2@propninja.com',
        password: 'password123',
        role: 'manager',
        level: 'PnL',
        designation: 'Business Head',
        departmentId: deptMap['Sales']?._id || department._id,
        status: 'active'
      });
    }

    let salesTeam2 = await Team.findOne({ name: 'Sales Team 2' });
    if (!salesTeam2 && pnlHead2) {
      salesTeam2 = await Team.create({
        name: 'Sales Team 2',
        pnlHeadId: pnlHead2._id,
        description: 'Secondary Sales Team'
      });
      pnlHead2.teamId = salesTeam2._id;
      await pnlHead2.save();
      console.log('Sales Team 2 & PnL 2 Created');
    }

    // Update existing employee to report to N1
    const employee = await User.findOne({ email: employeeEmail });
    if (employee && n1Manager && salesTeam1) {
      if (!employee.reportingManagerId || !employee.teamId) {
        employee.reportingManagerId = n1Manager._id;
        employee.level = 'N0';
        employee.teamId = salesTeam1._id;
        await employee.save();
        console.log('Employee updated to report to N1');
      }
    }

    console.log('Data Imported!');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

importData();
