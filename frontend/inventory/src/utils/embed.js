export function isEmbeddedInventory() {
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  return !(/\/inventory$/i.test(base) || base === '/inventory')
}

export function testimonialsProfilePath() {
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  return `${base}/profile`.replace(/\/{2,}/g, '/')
}
