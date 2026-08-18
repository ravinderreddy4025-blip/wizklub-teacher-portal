const mongoose = require('mongoose');
const { loadRootEnv } = require('../src/config/loadEnv');

loadRootEnv();

const User = require('../src/models/User');
const Division = require('../src/models/Division');
const School = require('../src/models/School');
const Kit = require('../src/models/Kit');
const Dispatch = require('../src/models/Dispatch');
const AuditReport = require('../src/models/AuditReport');
const ReplacementRequest = require('../src/models/ReplacementRequest');
const DivisionAuditWindow = require('../src/models/DivisionAuditWindow');
const Notification = require('../src/models/Notification');

async function clearAdminData() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const results = {};

  results.dispatches = (await Dispatch.deleteMany({})).deletedCount;
  results.auditReports = (await AuditReport.deleteMany({})).deletedCount;
  results.replacementRequests = (await ReplacementRequest.deleteMany({})).deletedCount;
  results.auditWindows = (await DivisionAuditWindow.deleteMany({})).deletedCount;
  results.notifications = (await Notification.deleteMany({})).deletedCount;
  results.schools = (await School.deleteMany({})).deletedCount;
  results.kits = (await Kit.deleteMany({})).deletedCount;
  results.divisions = (await Division.deleteMany({})).deletedCount;
  results.nonAdminUsers = (await User.deleteMany({ role: { $ne: 'Admin' } })).deletedCount;

  const adminCount = await User.countDocuments({ role: 'Admin' });

  console.log('\nCleared:');
  Object.entries(results).forEach(([key, count]) => console.log(`  ${key}: ${count}`));
  console.log(`\nAdmin accounts kept: ${adminCount}`);

  await mongoose.disconnect();
  process.exit(0);
}

clearAdminData().catch((err) => {
  console.error('Failed to clear data:', err.message);
  process.exit(1);
});
