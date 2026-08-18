const { Worker } = require('bullmq');
const Notification = require('../../models/Notification');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
};

// Start a BullMQ worker for the 'bulk-notifications' queue
const notificationWorker = new Worker('bulk-notifications', async job => {
  const { type, recipientId, message, entityId, entityType } = job.data;
  console.log(`[NotificationWorker] Dispatching ${type} to user ${recipientId}`);

  try {
    const newNotification = new Notification({
      recipient: recipientId,
      type,
      message,
      relatedEntity: {
        entityType,
        entityId
      }
    });

    await newNotification.save();

    // Optionally update real-time websockets (socket.io) if applicable
    
  } catch (error) {
    console.error('[NotificationWorker] Failed to save notification:', error);
    throw error;
  }

  return { success: true };
}, { connection });

notificationWorker.on('failed', (job, err) => {
  console.error(`[NotificationWorker] Job ${job.id} failed:`, err);
});

module.exports = notificationWorker;
