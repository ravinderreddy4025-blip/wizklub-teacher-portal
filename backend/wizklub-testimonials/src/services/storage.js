import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
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

let client = null

function getClient() {
  if (!client) {
    const clientConfig = { region: config.s3.region }
    if (config.s3.accessKeyId && config.s3.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      }
    }
    client = new S3Client(clientConfig)
  }
  return client
}

export function isStorageConfigured() {
  return Boolean(config.s3.bucket && config.s3.region)
}

function buildObjectPath(folderParts, uploadId, ext) {
  return [config.s3.prefix, ...folderParts, `${uploadId}.${ext}`]
    .filter(Boolean)
    .join('/')
    .replace(/^\/+/, '')
}

function publicObjectUrl(objectPath) {
  if (config.s3.publicBaseUrl) {
    return `${config.s3.publicBaseUrl.replace(/\/+$/, '')}/${objectPath}`
  }
  return `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${objectPath}`
}

export async function uploadToS3(fileBuffer, { folderParts, uploadId, mediaType, mimetype }) {
  if (!isStorageConfigured()) {
    throw new Error(
      'S3 is not configured. Set TESTIMONIALS_S3_BUCKET (or AWS_S3_BUCKET) and AWS_REGION.',
    )
  }

  const ext = MIME_TO_EXT[mimetype] || (mediaType === 'video' ? 'mp4' : 'jpg')
  const objectPath = buildObjectPath(folderParts, uploadId, ext)

  const putInput = {
    Bucket: config.s3.bucket,
    Key: objectPath,
    Body: fileBuffer,
    ContentType: mimetype || 'application/octet-stream',
    CacheControl: 'public, max-age=31536000',
  }
  if (config.s3.objectAcl) {
    putInput.ACL = config.s3.objectAcl
  }

  await getClient().send(new PutObjectCommand(putInput))

  return {
    publicUrl: publicObjectUrl(objectPath),
    objectPath,
    bytes: fileBuffer.length,
  }
}

export async function deleteFromS3(objectPath) {
  if (!objectPath || !isStorageConfigured()) return

  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: config.s3.bucket,
        Key: String(objectPath).replace(/^\/+/, ''),
      }),
    )
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return
    throw err
  }
}
