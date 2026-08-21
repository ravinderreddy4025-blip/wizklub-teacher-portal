import { Storage } from '@google-cloud/storage'
import { config } from '../config.js'

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'image/tiff': 'tiff',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'video/x-matroska': 'mkv',
  'video/webm': 'webm',
  'video/x-msvideo': 'avi',
  'video/x-m4v': 'm4v',
}

let storage = null
let bucket = null

function parseGcsCredentials() {
  if (config.gcs.credentialsBase64) {
    try {
      return JSON.parse(Buffer.from(config.gcs.credentialsBase64, 'base64').toString('utf8'))
    } catch {
      throw new Error('[GCS] Failed to parse GCS_CREDENTIALS_BASE64. Use base64-encoded service account JSON.')
    }
  }

  if (config.gcs.credentials) {
    try {
      return JSON.parse(config.gcs.credentials)
    } catch {
      throw new Error('[GCS] Failed to parse GCS_CREDENTIALS JSON. Paste minified service account JSON in .env.')
    }
  }

  return null
}

function getBucket() {
  if (!bucket) {
    const credentials = parseGcsCredentials()
    if (!credentials) {
      throw new Error('[GCS] Missing credentials. Set GCS_CREDENTIALS or GCS_CREDENTIALS_BASE64 in .env.')
    }

    storage = new Storage({ credentials })
    bucket = storage.bucket(config.gcs.bucketName)
  }
  return bucket
}

export function isStorageConfigured() {
  return Boolean(config.gcs.bucketName)
}

export async function uploadToGCS(fileBuffer, { folderParts, uploadId, mediaType, mimetype }) {
  if (!isStorageConfigured()) {
    throw new Error('GCS is not configured. Set GCS_BUCKET_NAME environment variable.')
  }

  const ext = MIME_TO_EXT[mimetype] || (mediaType === 'video' ? 'mp4' : 'jpg')
  const objectPath = [config.gcs.folder, ...folderParts, `${uploadId}.${ext}`]
    .filter(Boolean)
    .join('/')

  const b = getBucket()
  const file = b.file(objectPath)

  await file.save(fileBuffer, {
    contentType: mimetype,
    resumable: false,
    metadata: {
      cacheControl: 'public, max-age=31536000',
    },
  })

  const publicUrl = `https://storage.googleapis.com/${config.gcs.bucketName}/${objectPath}`

  return {
    publicUrl,
    objectPath,
    bytes: fileBuffer.length,
  }
}

export async function deleteFromGCS(objectPath) {
  if (!objectPath || !isStorageConfigured()) return

  try {
    const b = getBucket()
    await b.file(objectPath).delete()
  } catch (err) {
    if (err.code === 404) return
    throw err
  }
}
