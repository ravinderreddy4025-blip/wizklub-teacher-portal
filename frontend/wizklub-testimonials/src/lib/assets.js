/** Public asset URL respecting Vite base path (e.g. /wizklub-testimonials/). */
export function assetUrl(path) {
  const rel = String(path || '').replace(/^\//, '')
  const base = import.meta.env.BASE_URL || '/'
  return `${base}${rel}`
}
