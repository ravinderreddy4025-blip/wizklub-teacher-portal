import cors from 'cors'
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from './config.js'
import { connectDatabase } from './db/connect.js'
import { createBatchUploadsRouter } from './routes/batchUploads.js'
import { createAuthRouter } from './routes/auth.js'
import { createFeedbackRouter } from './routes/feedback.js'
import { createHealthRouter } from './routes/health.js'
import { createInventoryBridgeRouter } from './routes/inventoryBridge.js'
import { createTeacherRouter } from './routes/teacher.js'
import { createUploadsRouter } from './routes/uploads.js'
import { isStorageConfigured } from './services/storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendDist = path.resolve(__dirname, '../../../frontend/wizklub-testimonials/dist')

const mongoReady = await connectDatabase()

const app = express()

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true, mongo: mongoReady, storage: isStorageConfigured() })
})

app.use('/api/teacher', createAuthRouter())
app.use('/api/teacher', createTeacherRouter())
app.use('/api/teacher', createUploadsRouter())
app.use('/api/teacher', createBatchUploadsRouter())
app.use('/api/teacher', createFeedbackRouter())
app.use('/api/teacher', createHealthRouter())
app.use('/api/teacher/inventory', createInventoryBridgeRouter())

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { index: false, maxAge: '1h' }))

  app.get(/^(?!\/api\/|\/uploads\/|\/health).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'))
  })
}

app.use((err, _req, res, _next) => {
  if (err?.message === 'Unsupported file type.' || err?.message === 'File too large.') {
    return res.status(415).json({ ok: false, error: err.message })
  }
  console.error(err)
  res.status(500).json({ error: 'Internal server error.' })
})

app.listen(config.port, () => {
  console.log(`WizKlub API listening on http://localhost:${config.port}`)
  if (fs.existsSync(frontendDist)) {
    console.log(`Serving PWA from ${frontendDist}`)
  }
})
