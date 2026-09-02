let loadPromise = null

/**
 * Inject /vendor/opencv/opencv.js once and resolve when the runtime is ready.
 *
 * `cv` is an Emscripten Module whose `then()` returns the Module itself, so it
 * is a thenable that re-adopts forever. Never resolve with `cv`, never return a
 * thenable, never call `cv.then()` — this resolves with nothing and the caller
 * reads `window.cv`. Wait on `onRuntimeInitialized` only.
 */
export function loadOpenCv() {
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    if (window.cv?.Mat) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.async = true
    script.src = `${import.meta.env.BASE_URL || '/'}vendor/opencv/opencv.js`

    script.onerror = () => reject(new Error(`Failed to load OpenCV.js from "${script.src}".`))

    script.onload = () => {
      const cv = window.cv
      if (!cv) {
        reject(new Error('OpenCV.js loaded but window.cv is missing.'))
        return
      }
      if (cv.Mat) {
        resolve()
        return
      }
      const previous = cv.onRuntimeInitialized
      cv.onRuntimeInitialized = () => {
        if (typeof previous === 'function') previous()
        resolve()
      }
    }

    document.head.appendChild(script)
  })

  return loadPromise
}
