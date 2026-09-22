const app = require('./src/app');
const env = require('./src/config/env');
const connectDatabase = require('./src/config/database');
const { preloadBrandLogo } = require('./src/utils/brandLogo');

const startServer = async () => {
  try {
    await connectDatabase();
    await preloadBrandLogo();
    app.listen(env.port, () => {
      const { isS3Ready } = require('./src/services/s3Media');
      const media = isS3Ready()
        ? `s3://${env.s3.bucket}/${env.s3.prefix}`
        : 'UNCONFIGURED (set AWS_S3_BUCKET, AWS_REGION, and credentials)';
      console.log(`Server running on port ${env.port}  media=${media}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
