const app = require('./src/app');
const env = require('./src/config/env');
const connectDatabase = require('./src/config/database');

const startServer = async () => {
  try {
    await connectDatabase();
    app.listen(env.port, () => {
      const media = env.s3.bucket && env.s3.region
        ? `s3://${env.s3.bucket}/${env.s3.prefix}`
        : env.nodeEnv === 'production'
          ? 'UNCONFIGURED (photo/video uploads will fail)'
          : 'local ./uploads (dev fallback)';
      console.log(`Server running on port ${env.port}  media=${media}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
