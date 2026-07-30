import { ALLOWED_MIME_TYPES, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from '../api/constants'

const PHOTO_FORMATS = 'JPG, PNG, WEBP, HEIC, GIF, TIFF'
const VIDEO_FORMATS = 'MP4, MOV, 3GP, MKV, WEBM, AVI, M4V'

export function validateUploadFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: `Unsupported file type. Photos: ${PHOTO_FORMATS}. Videos: ${VIDEO_FORMATS}.` }
  }

  const isVideo = file.type.startsWith('video/')
  const maxSize = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES

  if (file.size > maxSize) {
    const limitMb = Math.round(maxSize / (1024 * 1024))
    return { ok: false, error: `File too large. Max ${limitMb} MB for ${isVideo ? 'video' : 'photo'}.` }
  }

  return { ok: true, mediaType: isVideo ? 'video' : 'photo' }
}

export function validateGroupPhotoFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: `Unsupported file type. Photos: ${PHOTO_FORMATS}. Videos: ${VIDEO_FORMATS}.` }
  }

  const isVideo = file.type.startsWith('video/')
  const maxSize = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES

  if (file.size > maxSize) {
    const limitMb = Math.round(maxSize / (1024 * 1024))
    return { ok: false, error: `File too large. Max ${limitMb} MB for ${isVideo ? 'video' : 'photo'}.` }
  }

  return { ok: true, mediaType: isVideo ? 'video' : 'photo' }
}
