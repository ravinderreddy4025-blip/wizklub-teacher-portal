const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '..', '..', '..', '.env'),
  override: false,
});

// Single shared Mongo host — PMO reads MONGODB_URI / MONGODB_DB.
if (!String(process.env.MONGODB_URI || '').trim() && String(process.env.MONGO_URI || '').trim()) {
  process.env.MONGODB_URI = String(process.env.MONGO_URI).trim();
}
if (!String(process.env.MONGODB_DB || '').trim() && String(process.env.PMO_MONGO_DB_NAME || '').trim()) {
  process.env.MONGODB_DB = String(process.env.PMO_MONGO_DB_NAME).trim();
}
