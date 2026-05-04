const mongoose = require('mongoose');

const EtimeConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    enabled: { type: Boolean, default: false },
    driver: { type: String, enum: ['mssql', 'mysql', 'access'], default: 'mssql' },
    host: { type: String, trim: true },
    port: { type: Number },
    dbName: { type: String, trim: true },
    dbPath: { type: String, trim: true },
    dbUser: { type: String, trim: true },
    dbPasswordEnc: { type: String, trim: true },
    startFrom: { type: Date },
    intervalMs: { type: Number, default: 300000 },
    timezone: { type: String, trim: true, default: 'Asia/Kolkata' },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('EtimeConfig', EtimeConfigSchema);
