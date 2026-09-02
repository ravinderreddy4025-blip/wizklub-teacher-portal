/**
 * Copy OpenCV.js from @techstark/opencv-js into public/ so the app serves it
 * locally instead of depending on an external CDN.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'node_modules', '@techstark', 'opencv-js', 'dist', 'opencv.js')
const destDir = path.join(root, 'public', 'vendor', 'opencv')
const dest = path.join(destDir, 'opencv.js')

if (!fs.existsSync(src)) {
  console.error(`[copy-opencv] Missing ${src}. Run npm install first.`)
  process.exit(1)
}

fs.mkdirSync(destDir, { recursive: true })
fs.copyFileSync(src, dest)
console.log(`[copy-opencv] Copied opencv.js (${fs.statSync(dest).size} bytes)`)
