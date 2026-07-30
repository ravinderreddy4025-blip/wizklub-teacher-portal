import mongoose from 'mongoose'
import { config } from '../config.js'
import { setDatabaseReady } from './state.js'

export async function connectDatabase() {
  try {
    await mongoose.connect(config.mongoUri, {
      dbName: config.mongoDbName,
      serverSelectionTimeoutMS: 15_000,
      connectTimeoutMS: 15_000,
    })
    setDatabaseReady(true)
    console.log(`[MongoDB] Connected (db: ${config.mongoDbName})`)
    return true
  } catch (err) {
    mongoose.set('bufferCommands', false)
    setDatabaseReady(false)
    console.error('[MongoDB] Connection failed:', err.message)
    const isProd = process.env.NODE_ENV === 'production' || process.env.TESTIMONIALS_NODE_ENV === 'production'
    if (isProd) {
      process.exit(1)
    }
    console.warn('[MongoDB] Dev: continuing without database — API writes may fail until Mongo is reachable.')
    return false
  }
}
