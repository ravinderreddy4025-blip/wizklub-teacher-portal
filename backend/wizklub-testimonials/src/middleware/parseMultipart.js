import Busboy from 'busboy'

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

    busboy.on('field', (name, value) => {
      fields[name] = value
    })

    busboy.on('file', (name, stream, info) => {
      if (name !== fieldName) {
        stream.resume()
        return
      }

      const { filename, mimeType } = info
      if (allowedMimeTypes && !allowedMimeTypes.includes(mimeType)) {
        parseError = new Error('Unsupported file type.')
        stream.resume()
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

      stream.on('end', () => {
        if (exceeded) {
          parseError = new Error('File too large.')
          return
        }

        uploadedFile = {
          originalname: filename,
          mimetype: mimeType,
          size,
          buffer: Buffer.concat(chunks),
        }
      })
    })

    busboy.on('error', (err) => {
      parseError = err
    })

    busboy.on('finish', () => {
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
