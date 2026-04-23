require('./src/bootstrap');
const { createApp, start: runStart } = require('./src/server');

const app = createApp();

function start() {
  return runStart(app);
}

module.exports = { app, start };

if (require.main === module) {
  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] unhandledRejection:', reason);
    if (process.env.NODE_ENV === 'production') process.exit(1);
  });

  process.on('uncaughtException', (err) => {
    console.error('[FATAL] uncaughtException:', err);
    process.exit(1);
  });

  start();
}
