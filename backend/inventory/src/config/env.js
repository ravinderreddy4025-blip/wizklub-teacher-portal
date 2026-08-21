const { loadRootEnv, resolveInventoryMongoUri } = require('./loadEnv');

loadRootEnv();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || process.env.INVENTORY_PORT) || 5002,
  mongoUri: resolveInventoryMongoUri(),
  mongoDbName: String(process.env.INVENTORY_MONGO_DB_NAME || 'wizklub-inventory').trim(),
  jwtSecret: process.env.JWT_SECRET,
  credentialKey: String(process.env.INVENTORY_CREDENTIAL_KEY || '').trim() || undefined,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  wizklubApiBaseUrl: process.env.WIZKLUB_API_BASE_URL || 'https://api.wizklub.com',
  s3: {
    region: String(process.env.AWS_REGION || process.env.INVENTORY_S3_REGION || '').trim(),
    bucket: String(
      process.env.AWS_S3_BUCKET ||
        process.env.INVENTORY_S3_BUCKET ||
        process.env.S3_BUCKET_NAME ||
        ''
    ).trim(),
    prefix: String(
      process.env.INVENTORY_S3_PREFIX || process.env.S3_UPLOAD_PREFIX || 'inventory'
    ).trim() || 'inventory',
    accessKeyId: String(process.env.AWS_ACCESS_KEY_ID || '').trim() || undefined,
    secretAccessKey: String(process.env.AWS_SECRET_ACCESS_KEY || '').trim() || undefined,
    publicBaseUrl: String(process.env.AWS_S3_PUBLIC_BASE_URL || process.env.INVENTORY_S3_PUBLIC_BASE_URL || '').trim(),
    usePublicUrls:
      process.env.INVENTORY_S3_PUBLIC === '1' ||
      process.env.INVENTORY_S3_PUBLIC === 'true',
    signedUrlTtlSec: Math.min(
      7 * 24 * 3600,
      Math.max(60, Number(process.env.INVENTORY_S3_SIGNED_URL_TTL || 3600) || 3600)
    ),
  },
  ses: {
    region: String(process.env.SES_REGION || process.env.AWS_REGION || process.env.INVENTORY_S3_REGION || '').trim(),
    from: String(process.env.SES_FROM_EMAIL || process.env.SES_FROM || '').trim(),
    amCreatedTemplate: String(
      process.env.SES_AM_CREATED_TEMPLATE || 'WIZ_INVENTORY_AM_CREDENTIALS_TEMPLATE'
    ).trim(),
    amResetTemplate: String(
      process.env.SES_AM_REGENERATED_TEMPLATE || 'WIZ_INVENTORY_AM_PASSWORD_RESET_TEMPLATE'
    ).trim(),
    accessKeyId: String(process.env.AWS_NOTIF_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || '').trim() || undefined,
    secretAccessKey: String(process.env.AWS_NOTIF_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY || '').trim() || undefined,
    logoUrl: String(process.env.WIZKLUB_LOGO_PATH || '').trim(),
  },
};

if (!env.mongoUri) {
  console.warn('Warning: Set MONGO_URI + INVENTORY_MONGO_DB_NAME (or MONGODB_URI) in the project root .env file.');
}

if (env.nodeEnv === 'production' && !env.jwtSecret) {
  throw new Error('JWT_SECRET is required in production');
}

if (env.s3.bucket && env.s3.accessKeyId && env.s3.secretAccessKey) {
  const secretLen = env.s3.secretAccessKey.length;
  if (secretLen !== 40) {
    console.warn(
      `[WARN] AWS_SECRET_ACCESS_KEY length is ${secretLen} (expected 40). S3 uploads will fail with SignatureDoesNotMatch if the key was truncated when pasted.`
    );
  }
}

module.exports = env;
