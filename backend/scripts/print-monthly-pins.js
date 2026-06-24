/**
 * Print office PIN calendar for the current month (IST).
 * Usage: node scripts/print-monthly-pins.js [year] [month]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Location = require('../models/Location');
const { getMonthOfficePinSchedule } = require('../utils/officePin');
const { getBusinessParts } = require('../utils/businessTime');

const parts = getBusinessParts(new Date());
const year = Number(process.argv[2]) || parts.year;
const month = Number(process.argv[3]) || parts.month + 1;

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    const locations = await Location.find({ active: true }).sort({ name: 1 }).lean();
    if (!locations.length) {
      console.log('No active locations found.');
      process.exit(0);
    }

    const monthLabel = new Date(year, month - 1, 1).toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata'
    });

    console.log(`\nOffice PIN Calendar — ${monthLabel} (IST)\n`);

    for (const loc of locations) {
      const schedule = getMonthOfficePinSchedule(loc._id, year, month);
      console.log(`=== ${loc.name} ===`);
      console.log('Date       | Day       | PIN');
      console.log('-----------|-----------|--------');
      for (const row of schedule) {
        console.log(`${row.businessDate} | ${row.dayName.padEnd(9)} | ${row.officePin}`);
      }
      console.log('');
    }

    await mongoose.disconnect();
  })
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
