const mongoose = require('mongoose');

const EtimeConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    enabled: { type: Boolean, default: false },
    driver: { type: String, enum: ['mssql', 'mysql'], default: 'mssql' },
    host: { type: String, trim: true },
    port: { type: Number },
    dbName: { type: String, trim: true },
    dbUser: { type: String, trim: true },
    dbPasswordEnc: { type: String, trim: true },
    startFrom: { type: Date },
    intervalMs: { type: Number, default: 60000 },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('EtimeConfig', EtimeConfigSchema);
