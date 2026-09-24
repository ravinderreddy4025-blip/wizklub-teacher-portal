import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') })

const mongoUri = String(process.env.MONGO_URI || '').trim() || 'mongodb://localhost:27017'
const mongoDbName =
  String(process.env.TESTIMONIALS_MONGO_DB_NAME || process.env.MONGO_DB_NAME || '').trim() || 'wizklub_testimonials'

function boolEnv(name, defaultValue = false) {
  const raw = process.env[name]
  if (raw == null || String(raw).trim() === '') return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase())
}

export const config = {
  port: Number(process.env.TESTIMONIALS_PORT) || 3001,
  mongoUri,
  mongoDbName,
  /** Read-only health snapshot database (written by backend/health-snapshot). Same host as MONGO_URI. */
  healthMongoDbName: String(process.env.HEALTH_MONGO_DB_NAME || '').trim() || 'wizklub_health',
  inventoryApiBaseUrl: String(process.env.INVENTORY_API_BASE_URL || 'http://127.0.0.1:5002/api').replace(/\/$/, ''),
  internalBridgeSecret: String(process.env.INTERNAL_BRIDGE_SECRET || '').trim(),
  s3: {
    region: String(process.env.AWS_REGION || 'ap-south-1').trim(),
    bucket: String(
      process.env.TESTIMONIALS_S3_BUCKET ||
        process.env.AWS_S3_BUCKET ||
        process.env.S3_BUCKET_NAME ||
        'wiz-recordings',
    ).trim(),
    prefix: String(
      process.env.TESTIMONIALS_S3_PREFIX || 'testimonials',
    )
      .trim()
      .replace(/^\/+|\/+$/g, ''),
    accessKeyId: String(process.env.AWS_ACCESS_KEY_ID || '').trim() || undefined,
    secretAccessKey: String(process.env.AWS_SECRET_ACCESS_KEY || '').trim() || undefined,
    publicBaseUrl: String(
      process.env.TESTIMONIALS_S3_PUBLIC_BASE_URL || process.env.AWS_S3_PUBLIC_BASE_URL || '',
    ).trim(),
    objectAcl: boolEnv('TESTIMONIALS_S3_PUBLIC_ACL', true) ? 'public-read' : undefined,
  },
  lms: {
    baseUrl: String(process.env.LMS_BASE_URL || '').trim().replace(/\/$/, ''),
    apiKey: String(process.env.LMS_API_KEY || '').trim(),
    apiSecret: String(process.env.LMS_API_SECRET || '').trim(),
  },
}
