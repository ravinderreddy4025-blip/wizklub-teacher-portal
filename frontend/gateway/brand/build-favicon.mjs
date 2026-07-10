import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const logoPath = path.join(dir, 'logo.png')
const b64 = fs.readFileSync(logoPath).toString('base64')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="WizKlub Futurz">
  <rect width="64" height="64" rx="12" fill="#fff7ed"/>
  <image href="data:image/png;base64,${b64}" x="4" y="20" width="56" height="24" preserveAspectRatio="xMidYMid meet"/>
</svg>
`

fs.writeFileSync(path.join(dir, 'favicon.svg'), svg)
console.log('favicon.svg updated', svg.length, 'bytes')
