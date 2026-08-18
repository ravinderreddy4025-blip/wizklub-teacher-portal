const { Worker } = require('bullmq');
const AuditReport = require('../../models/AuditReport');
const Kit = require('../../models/Kit');

// Configure worker connection to Redis
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
};

// Start a BullMQ worker for the 'audit-validation' queue
const auditWorker = new Worker('audit-validation', async job => {
  const { auditId, items } = job.data;
  console.log(`[AuditWorker] Processing validation for Audit ID: ${auditId}`);

  let hasMismatch = false;

  // Simulate heavy background processing:
  // E.g., comparing expected vs reported items, finding mismatches
  for (const item of items) {
    if ((item.availableQuantity + item.lostQuantity + item.damagedQuantity) !== item.expectedQuantity) {
      hasMismatch = true;
      break;
    }
  }

  if (hasMismatch) {
    // Flag the audit as mismatch
    await AuditReport.findByIdAndUpdate(auditId, { status: 'Mismatch' });
    
    // Optionally trigger a notification job here
    const { addNotificationJob } = require('../queue');
    await addNotificationJob({
      type: 'AuditMismatch',
      // Provide appropriate payload
      message: `Mismatch detected in audit ${auditId}`
    });
  }

  console.log(`[AuditWorker] Finished job ${job.id}`);
  return { success: true, mismatch: hasMismatch };
}, { connection });

auditWorker.on('failed', (job, err) => {
  console.error(`[AuditWorker] Job ${job.id} failed:`, err);
});

module.exports = auditWorker;
