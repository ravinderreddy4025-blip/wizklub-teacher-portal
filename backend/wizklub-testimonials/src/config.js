import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') })

const mongoUri = String(process.env.MONGO_URI || '').trim() || 'mongodb://localhost:27017'
const mongoDbName =
  String(process.env.TESTIMONIALS_MONGO_DB_NAME || process.env.MONGO_DB_NAME || '').trim() || 'wizklub_testimonials'

export const config = {
  port: Number(process.env.TESTIMONIALS_PORT) || 3001,
  mongoUri,
  mongoDbName,
  gcs: {
    bucketName: process.env.GCS_BUCKET_NAME ?? '',
    folder: process.env.GCS_FOLDER ?? 'wizklub',
    credentials: process.env.GCS_CREDENTIALS ?? '',
  },
  lms: {
    baseUrl: String(process.env.LMS_BASE_URL || '').trim().replace(/\/$/, ''),
    apiKey: String(process.env.LMS_API_KEY || '').trim(),
    apiSecret: String(process.env.LMS_API_SECRET || '').trim(),
  },
}
