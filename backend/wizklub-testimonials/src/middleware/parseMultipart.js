import Busboy from 'busboy'

function collectFile(stream, { filename, mimeType, allowedMimeTypes }) {
  return new Promise((resolve, reject) => {
    if (allowedMimeTypes && !allowedMimeTypes.includes(mimeType)) {
      stream.resume()
      reject(new Error('Unsupported file type.'))
      return
    }

    const chunks = []
    let size = 0
    let exceeded = false

    stream.on('limit', () => {
      exceeded = true
    })

    stream.on('data', (chunk) => {
      chunks.push(chunk)
      size += chunk.length
    })

    stream.on('error', reject)

    stream.on('end', () => {
      if (exceeded) {
        reject(new Error('File too large.'))
        return
      }

      resolve({
        originalname: filename,
        mimetype: mimeType,
        size,
        buffer: Buffer.concat(chunks),
      })
    })
  })
}

export function parseMultipartSingle({ fieldName = 'file', maxFileSize, allowedMimeTypes = null }) {
  return (req, res, next) => {
    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.startsWith('multipart/form-data')) {
      return res.status(400).json({ ok: false, error: 'Expected multipart/form-data request.' })
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: maxFileSize,
      },
    })

    const fields = {}
    let uploadedFile = null
    let parseError = null
    const fileJobs = []

    busboy.on('field', (name, value) => {
      fields[name] = value
    })

    busboy.on('file', (name, stream, info) => {
      if (name !== fieldName) {
        stream.resume()
        return
      }

      const { filename, mimeType } = info
      fileJobs.push(
        collectFile(stream, { filename, mimeType, allowedMimeTypes })
          .then((file) => {
            uploadedFile = file
          })
          .catch((err) => {
            parseError = err
          }),
      )
    })

    busboy.on('error', (err) => {
      parseError = err
    })

    busboy.on('finish', async () => {
      await Promise.all(fileJobs)

      if (parseError) {
        return next(parseError)
      }

      if (!uploadedFile) {
        return res.status(400).json({ ok: false, error: 'No file selected.' })
      }

      req.body = { ...req.body, ...fields }
      req.file = uploadedFile
      return next()
    })

    req.pipe(busboy)
  }
}

/** Multipart with zero or more files (attachments optional). */
export function parseMultipartMultiple({
  fieldName = 'files',
  maxFiles = 5,
  maxFileSize,
  allowedMimeTypes = null,
  requireFiles = false,
}) {
  return (req, res, next) => {
    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.startsWith('multipart/form-data')) {
      return res.status(400).json({ ok: false, error: 'Expected multipart/form-data request.' })
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        files: maxFiles,
        fileSize: maxFileSize,
      },
    })

    const fields = {}
    const uploadedFiles = []
    let parseError = null
    const fileJobs = []

    busboy.on('field', (name, value) => {
      fields[name] = value
    })

    busboy.on('file', (name, stream, info) => {
      if (name !== fieldName && name !== 'file' && name !== 'files') {
        stream.resume()
        return
      }

      if (uploadedFiles.length + fileJobs.length >= maxFiles) {
        stream.resume()
        parseError = new Error(`Maximum ${maxFiles} files allowed.`)
        return
      }

      const { filename, mimeType } = info
      fileJobs.push(
        collectFile(stream, { filename, mimeType, allowedMimeTypes })
          .then((file) => {
            uploadedFiles.push(file)
          })
          .catch((err) => {
            parseError = err
          }),
      )
    })

    busboy.on('error', (err) => {
      parseError = err
    })

    busboy.on('finish', async () => {
      await Promise.all(fileJobs)

      if (parseError) {
        return next(parseError)
      }

      if (requireFiles && uploadedFiles.length === 0) {
        return res.status(400).json({ ok: false, error: 'No file selected.' })
      }

      req.body = { ...req.body, ...fields }
      req.files = uploadedFiles
      req.file = uploadedFiles[0] ?? null
      return next()
    })

    req.pipe(busboy)
  }
}
