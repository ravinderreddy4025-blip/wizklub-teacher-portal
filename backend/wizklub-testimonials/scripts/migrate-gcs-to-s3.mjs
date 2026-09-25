/**
 * Migrate Teachers Portal media from GCS (or old S3 keys) → S3 new layout.
 *
 * New keys:
 *   testimonials/student/{photo|video}/{studentId}/{category}/{uploadId}.{ext}
 *   testimonials/batch/{photo|video}/{batchId}/{uploadId}.{ext}
 *
 * Usage (from backend/wizklub-testimonials):
 *   node scripts/migrate-gcs-to-s3.mjs              # dry-run (default)
 *   node scripts/migrate-gcs-to-s3.mjs --apply      # copy + update Mongo
 *   node scripts/migrate-gcs-to-s3.mjs --apply --delete-source
 *   node scripts/migrate-gcs-to-s3.mjs --apply --limit=20
 *   node scripts/migrate-gcs-to-s3.mjs --gcs-only   # skip old S3-layout rows
 *
 * Transfers GCS → S3 via streaming multipart upload (does not load whole files into RAM).
 *
 * Env:
 *   MONGO_URI, TESTIMONIALS_MONGO_DB_NAME
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *   TESTIMONIALS_S3_BUCKET, TESTIMONIALS_S3_PREFIX, TESTIMONIALS_S3_PUBLIC_ACL
 *   GCS_CREDENTIALS or GCS_CREDENTIALS_BASE64 (needed for private GCS)
 *   GCS_BUCKET_NAME (optional fallback)
 *
 * For private GCS objects install once:
 *   npm install @google-cloud/storage
 *
 * Note: feedback attachment URLs are not migrated by this script.
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { Readable } from 'stream'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const DELETE_SOURCE = args.has('--delete-source')
const INCLUDE_OLD_S3 = !args.has('--gcs-only')
const limitArg = [...args].find((a) => a.startsWith('--limit='))
const LIMIT = (() => {
  if (!limitArg) return Infinity
  const n = Number(limitArg.split('=')[1])
  return Number.isFinite(n) && n > 0 ? n : Infinity
})()

function boolEnv(name, defaultValue = false) {
  const raw = process.env[name]
  if (raw == null || String(raw).trim() === '') return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase())
}

const MONGO_URI = String(process.env.MONGO_URI || '').trim()
const MONGO_DB = String(process.env.TESTIMONIALS_MONGO_DB_NAME || 'wizklub_testimonials').trim()
const S3_BUCKET = String(
  process.env.TESTIMONIALS_S3_BUCKET || process.env.AWS_S3_BUCKET || 'wiz-recordings',
).trim()
const S3_PREFIX = String(process.env.TESTIMONIALS_S3_PREFIX || 'testimonials')
  .trim()
  .replace(/^\/+|\/+$/g, '')
const S3_REGION = String(process.env.AWS_REGION || 'ap-south-1').trim()
const S3_PUBLIC_BASE = String(
  process.env.TESTIMONIALS_S3_PUBLIC_BASE_URL || process.env.AWS_S3_PUBLIC_BASE_URL || '',
).trim()
const S3_ACL = boolEnv('TESTIMONIALS_S3_PUBLIC_ACL', true) ? 'public-read' : undefined

function isAlreadyNewLayout(keyOrUrl) {
  const value = String(keyOrUrl || '')
  return (
    value.includes(`${S3_PREFIX}/student/`) ||
    value.includes(`${S3_PREFIX}/batch/`) ||
    value.includes('/feedback/')
  )
}

function isGcsUrl(url) {
  return /storage\.googleapis\.com/i.test(String(url || ''))
}

function isOldS3Key(key) {
  const k = String(key || '').replace(/^\/+/, '')
  if (!k.startsWith(`${S3_PREFIX}/`)) return false
  if (isAlreadyNewLayout(k)) return false
  // old: testimonials/{studentId}/{category}/file
  //  or: testimonials/{batchId}/batch_group_uploads/file
  return true
}

function parseGcsUrl(url) {
  const u = new URL(url)
  const host = u.hostname.toLowerCase()

  // https://storage.googleapis.com/<bucket>/<object...>
  if (host === 'storage.googleapis.com') {
    const parts = decodeURIComponent(u.pathname).replace(/^\/+/, '').split('/')
    const bucket = parts.shift()
    const objectPath = parts.join('/')
    if (!bucket || !objectPath) {
      throw new Error(`Could not parse GCS URL: ${url}`)
    }
    return { bucket, objectPath }
  }

  // https://<bucket>.storage.googleapis.com/<object...>
  const match = host.match(/^(.+)\.storage\.googleapis\.com$/i)
  if (match) {
    const objectPath = decodeURIComponent(u.pathname).replace(/^\/+/, '')
    if (!objectPath) throw new Error(`Could not parse GCS URL: ${url}`)
    return { bucket: match[1], objectPath }
  }

  throw new Error(`Unsupported GCS URL host: ${host}`)
}

function extFromKeyOrUrl(value, mediaType) {
  const clean = String(value || '').split('?')[0]
  const match = clean.match(/\.([a-z0-9]+)$/i)
  if (match) return match[1].toLowerCase()
  return mediaType === 'video' ? 'mp4' : 'jpg'
}

function contentTypeFor(ext, mediaType) {
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    gif: 'image/gif',
    tiff: 'image/tiff',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    m4v: 'video/x-m4v',
    '3gp': 'video/3gpp',
  }
  return map[ext] || (mediaType === 'video' ? 'video/mp4' : 'application/octet-stream')
}

function buildNewKey({ kind, mediaType, ownerId, category, uploadId, ext }) {
  if (!ownerId) throw new Error(`Missing owner id for ${kind} upload ${uploadId}`)
  const parts =
    kind === 'student'
      ? [S3_PREFIX, 'student', mediaType, ownerId, category || 'other', `${uploadId}.${ext}`]
      : [S3_PREFIX, 'batch', mediaType, ownerId, `${uploadId}.${ext}`]
  return parts.filter(Boolean).join('/')
}

function publicS3Url(objectPath) {
  if (S3_PUBLIC_BASE) {
    return `${S3_PUBLIC_BASE.replace(/\/+$/, '')}/${objectPath}`
  }
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${objectPath}`
}

function getS3Client() {
  const clientConfig = { region: S3_REGION }
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    clientConfig.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
  }
  return new S3Client(clientConfig)
}

function parseGcsCredentials() {
  if (process.env.GCS_CREDENTIALS_BASE64) {
    return JSON.parse(Buffer.from(process.env.GCS_CREDENTIALS_BASE64, 'base64').toString('utf8'))
  }
  if (process.env.GCS_CREDENTIALS) {
    return JSON.parse(process.env.GCS_CREDENTIALS)
  }
  return null
}

const gcsBuckets = new Map()
let StorageCtor = null

async function getGcsBucket(bucketName) {
  const name = String(bucketName || process.env.GCS_BUCKET_NAME || '').trim()
  if (!name) {
    throw new Error('GCS bucket name missing (from URL or GCS_BUCKET_NAME).')
  }
  if (gcsBuckets.has(name)) return gcsBuckets.get(name)

  const credentials = parseGcsCredentials()
  if (!credentials) return null

  if (!StorageCtor) {
    try {
      ;({ Storage: StorageCtor } = await import('@google-cloud/storage'))
    } catch {
      throw new Error(
        'GCS credentials are set but @google-cloud/storage is not installed. Run: npm install @google-cloud/storage',
      )
    }
  }

  const storage = new StorageCtor({ credentials })
  const bucket = storage.bucket(name)
  gcsBuckets.set(name, bucket)
  return bucket
}

function quietStream(stream) {
  if (stream && typeof stream.setMaxListeners === 'function') {
    stream.setMaxListeners(0)
  }
  return stream
}

async function openGcsReadStream(blobUrl) {
  const { bucket, objectPath } = parseGcsUrl(blobUrl)
  const gcs = await getGcsBucket(bucket)
  if (gcs) {
    const file = gcs.file(objectPath)
    let contentLength
    try {
      const [metadata] = await file.getMetadata()
      const size = Number(metadata?.size)
      if (Number.isFinite(size) && size > 0) contentLength = size
    } catch {
      // Metadata is optional; multipart upload still works without it.
    }
    const stream = quietStream(file.createReadStream())
    return {
      stream,
      contentLength,
      sourceKey: objectPath,
      sourceBucket: bucket,
      sourceKind: 'gcs-stream',
    }
  }

  const response = await fetch(blobUrl)
  if (!response.ok) {
    throw new Error(
      `Failed to download GCS object (${response.status}). Set GCS_CREDENTIALS for private buckets.`,
    )
  }
  if (!response.body) {
    throw new Error(`GCS HTTP response had no body for ${blobUrl}`)
  }
  const lenHeader = response.headers.get('content-length')
  const parsedLen = lenHeader ? Number(lenHeader) : NaN
  return {
    stream: quietStream(Readable.fromWeb(response.body)),
    contentLength: Number.isFinite(parsedLen) && parsedLen > 0 ? parsedLen : undefined,
    sourceKey: objectPath,
    sourceBucket: bucket,
    sourceKind: 'gcs-http-stream',
  }
}

/** Stream GCS → S3 (multipart). Avoids loading whole videos into RAM. */
async function streamGcsToS3(s3, { blobUrl, key, contentType }) {
  const opened = await openGcsReadStream(blobUrl)
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
    Body: opened.stream,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000',
  }
  if (S3_ACL) params.ACL = S3_ACL
  if (opened.contentLength) params.ContentLength = opened.contentLength

  const upload = new Upload({
    client: s3,
    params,
    queueSize: 2,
    partSize: 8 * 1024 * 1024,
    leavePartsOnError: false,
  })

  let lastLogAt = 0
  upload.on('httpUploadProgress', (progress) => {
    const now = Date.now()
    if (now - lastLogAt < 5000) return
    lastLogAt = now
    const loaded = progress.loaded ?? 0
    const total = progress.total || opened.contentLength
    if (total) {
      const pct = Math.min(100, Math.round((loaded / total) * 100))
      console.log(`  … ${key} ${pct}% (${loaded}/${total} bytes)`)
    } else {
      console.log(`  … ${key} ${loaded} bytes uploaded`)
    }
  })

  try {
    await upload.done()
  } catch (err) {
    try {
      opened.stream.destroy?.(err)
    } catch {
      // ignore cleanup errors
    }
    throw err
  }

  return opened
}

async function copyS3ToS3(s3, fromKey, toKey, contentType) {
  const input = {
    Bucket: S3_BUCKET,
    Key: toKey,
    CopySource: `${S3_BUCKET}/${encodeURIComponent(fromKey).replace(/%2F/g, '/')}`,
    ContentType: contentType,
    MetadataDirective: 'REPLACE',
    CacheControl: 'public, max-age=31536000',
  }
  if (S3_ACL) input.ACL = S3_ACL
  await s3.send(new CopyObjectCommand(input))
}

async function deleteGcsObject(blobUrl) {
  const { bucket, objectPath } = parseGcsUrl(blobUrl)
  const gcs = await getGcsBucket(bucket)
  if (!gcs) {
    console.warn(`  skip GCS delete (no credentials): gs://${bucket}/${objectPath}`)
    return
  }
  await gcs.file(objectPath).delete({ ignoreNotFound: true })
}

async function deleteS3Object(s3, key) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }))
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return
    throw err
  }
}

function classifyStudentDoc(doc) {
  if (!doc.student_id) throw new Error(`uploads ${doc._id} missing student_id`)
  const mediaType = doc.media_type === 'video' ? 'video' : 'photo'
  const ext = extFromKeyOrUrl(doc.blob_key || doc.blob_url, mediaType)
  const newKey = buildNewKey({
    kind: 'student',
    mediaType,
    ownerId: doc.student_id,
    category: doc.category || 'other',
    uploadId: String(doc._id),
    ext,
  })
  return { collection: 'uploads', mediaType, ext, newKey, kind: 'student' }
}

function classifyBatchDoc(doc) {
  if (!doc.batch_id) throw new Error(`batch_group_uploads ${doc._id} missing batch_id`)
  const mediaType = doc.media_type === 'video' ? 'video' : 'photo'
  const ext = extFromKeyOrUrl(doc.blob_key || doc.blob_url, mediaType)
  const newKey = buildNewKey({
    kind: 'batch',
    mediaType,
    ownerId: doc.batch_id,
    uploadId: String(doc._id),
    ext,
  })
  return { collection: 'batch_group_uploads', mediaType, ext, newKey, kind: 'batch' }
}

function needsMigration(doc) {
  if (isAlreadyNewLayout(doc.blob_key) || isAlreadyNewLayout(doc.blob_url)) return false
  if (isGcsUrl(doc.blob_url)) return 'gcs'
  if (INCLUDE_OLD_S3 && isOldS3Key(doc.blob_key)) return 's3-old'
  return false
}

async function migrateOne(s3, db, doc, meta, progressLabel = '') {
  const source = needsMigration(doc)
  if (!source) return { status: 'skip' }

  const contentType = contentTypeFor(meta.ext, meta.mediaType)
  const prefix = progressLabel ? `${progressLabel} ` : ''
  console.log(
    `${prefix}[${APPLY ? 'APPLY' : 'DRY'}] ${meta.collection} ${doc._id} (${source}) → ${meta.newKey}`,
  )

  if (!APPLY) return { status: 'dry-run', newKey: meta.newKey, source }

  if (source === 's3-old') {
    const fromKey = String(doc.blob_key).replace(/^\/+/, '')
    if (fromKey === meta.newKey) return { status: 'skip-same' }
    try {
      await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: meta.newKey }))
      console.log('  target exists, updating Mongo only')
    } catch {
      await copyS3ToS3(s3, fromKey, meta.newKey, contentType)
    }
    if (DELETE_SOURCE) await deleteS3Object(s3, fromKey)
  } else {
    if (!doc.blob_url || !isGcsUrl(doc.blob_url)) {
      throw new Error(`Expected GCS blob_url for ${doc._id}`)
    }
    await streamGcsToS3(s3, {
      blobUrl: doc.blob_url,
      key: meta.newKey,
      contentType,
    })
    if (DELETE_SOURCE) await deleteGcsObject(doc.blob_url)
  }

  const newUrl = publicS3Url(meta.newKey)
  await db.collection(meta.collection).updateOne(
    { _id: doc._id },
    {
      $set: {
        blob_key: meta.newKey,
        blob_url: newUrl,
        file_path: meta.newKey,
      },
    },
  )

  console.log(`${prefix}  ok ${doc._id}`)
  return { status: 'migrated', newKey: meta.newKey, newUrl, source }
}

async function main() {
  if (!MONGO_URI) throw new Error('MONGO_URI is required')
  if (!S3_BUCKET) throw new Error('TESTIMONIALS_S3_BUCKET (or AWS_S3_BUCKET) is required')

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} | delete-source=${DELETE_SOURCE} | old-s3=${INCLUDE_OLD_S3}`)
  console.log(`Mongo DB: ${MONGO_DB}`)
  console.log(`S3: s3://${S3_BUCKET}/${S3_PREFIX}/ ...`)
  console.log('Transfer: streaming (multipart) — large videos stay out of RAM')

  await mongoose.connect(MONGO_URI, { dbName: MONGO_DB })
  const db = mongoose.connection.db
  const s3 = getS3Client()

  const uploads = await db.collection('uploads').find({}).toArray()
  const batchUploads = await db.collection('batch_group_uploads').find({}).toArray()

  const jobs = []
  for (const doc of uploads) {
    if (!needsMigration(doc)) continue
    jobs.push({ doc, meta: classifyStudentDoc(doc) })
  }
  for (const doc of batchUploads) {
    if (!needsMigration(doc)) continue
    jobs.push({ doc, meta: classifyBatchDoc(doc) })
  }

  console.log(`Found ${jobs.length} document(s) to migrate`)
  const selected = jobs.slice(0, Number.isFinite(LIMIT) ? LIMIT : jobs.length)
  if (selected.length < jobs.length) {
    console.log(`Limiting to first ${selected.length}`)
  }

  let migrated = 0
  let failed = 0
  let skipped = 0
  for (let i = 0; i < selected.length; i += 1) {
    const job = selected[i]
    const progressLabel = `[${i + 1}/${selected.length}]`
    try {
      const result = await migrateOne(s3, db, job.doc, job.meta, progressLabel)
      if (result.status === 'migrated') migrated += 1
      else skipped += 1
    } catch (err) {
      failed += 1
      console.error(`  FAILED ${job.doc._id}:`, err.message || err)
    }
  }

  console.log(
    `Done. migrated=${migrated} failed=${failed} skipped=${skipped} considered=${selected.length}`,
  )
  if (!APPLY) {
    console.log('Re-run with --apply to copy files and update Mongo.')
  }

  await mongoose.disconnect()
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
