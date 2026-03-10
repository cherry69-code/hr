const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

console.log('--- Environment Config Check ---');
console.log('Cloudinary Cloud:', process.env.CLOUDINARY_CLOUD_NAME || 'MISSING');
console.log('Cloudinary Key:', process.env.CLOUDINARY_API_KEY || 'MISSING');
const secret = process.env.CLOUDINARY_API_SECRET || '';
console.log('Cloudinary Secret:', secret ? (secret.startsWith('CLOUDINARY_URL') ? '❌ CORRUPTED (Starts with CLOUDINARY_URL)' : '✅ OK (Masked: ' + secret.substring(0, 3) + '...)') : 'MISSING');
console.log('------------------------------');

const app = express();

// CORS Configuration (Must be first)
const corsOriginsRaw = process.env.CORS_ORIGINS || [
  'http://localhost:4200',
  'https://www.hrpropninja.com',
  'https://hrpropninja.com',
  'http://www.hrpropninja.com',
  'http://hrpropninja.com'
].join(',');

const corsOrigins = String(corsOriginsRaw)
  .split(',')
  .map((o) => String(o).trim().replace(/[`"' \t\r\n]/g, ''))
  .filter(Boolean);

console.log('Allowed CORS Origins:', corsOrigins);

const corsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Ensure CORS headers are present even on 404/errors and for any preflight
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Set security headers
app.use(helmet());
app.use(xss());
app.use(mongoSanitize());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);



// Mount routers
const auth = require('./routes/authRoutes');
const employees = require('./routes/employeeRoutes');
const attendance = require('./routes/attendanceRoutes');
const documents = require('./routes/documentRoutes');
const leaves = require('./routes/leaveRoutes');
const payroll = require('./routes/payrollRoutes');
const dashboard = require('./routes/dashboardRoutes');
const departments = require('./routes/departmentRoutes');
const locations = require('./routes/locationRoutes');
const slabs = require('./routes/slabRoutes');
const esop = require('./routes/esopRoutes');
const teams = require('./routes/teamRoutes');
const templates = require('./routes/templateRoutes');
const esign = require('./routes/esignRoutes');
const vault = require('./routes/vaultRoutes');
const geocode = require('./routes/geocodeRoutes');
const incentives = require('./routes/incentiveRoutes');
const biometric = require('./routes/biometricRoutes');
const fieldAttendance = require('./routes/fieldAttendanceRoutes');
const errorHandler = require('./middlewares/errorMiddleware');

app.use('/api/auth', auth);
app.use('/api/employees', employees);
app.use('/api/attendance', attendance);
app.use('/api/documents', documents);
app.use('/api/leaves', leaves);
app.use('/api/payroll', payroll);
app.use('/api/dashboard', dashboard);
app.use('/api/departments', departments);
app.use('/api/locations', locations);
app.use('/api/slabs', slabs);
app.use('/api/esop', esop);
app.use('/api/teams', teams);
app.use('/api/templates', templates);
app.use('/api/esign', esign);
app.use('/api/vault', vault);
app.use('/api/geocode', geocode);
app.use('/api/incentives', incentives);
app.use('/api/biometric', biometric);
app.use('/api/field-attendance', fieldAttendance);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Error Handler Middleware
app.use(errorHandler);

// Home route
app.get('/', (req, res) => {
  res.send('HR Prop Ninja API is running...');
});

module.exports = app;
