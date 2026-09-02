/**
 * OpenCV ArUco MarkerCodec implementation.
 *
 * One dictionary + one detector per scanner session (init → decode* → dispose).
 * Dictionary size is derived from the conduct roster max SR Code id.
 */

import { rotationFromCorners } from '../orientation.js'

const MIN_CAPACITY = 250

/** Smallest power-of-two bucket (≥250) that fits every id in [1, maxStudentQrCodeId]. */
export function dictionaryCapacityForMaxId(maxStudentQrCodeId) {
  const needed = Math.max(Number(maxStudentQrCodeId) || 0, MIN_CAPACITY)
  if (needed <= MIN_CAPACITY) return MIN_CAPACITY
  return 1 << (32 - Math.clz32(needed - 1))
}

function cornersFromMat(mat) {
  const points = []
  const data = mat.data32F
  for (let i = 0; i < 4; i += 1) {
    points.push({ x: data[i * 2], y: data[i * 2 + 1] })
  }
  return points
}

export class ArUcoMarkerCodec {
  constructor() {
    this.cv = null
    this.dictionary = null
    this.params = null
    this.refine = null
    this.detector = null
    this.sessionCapacity = 0
  }

  _markerCount(dictionary) {
    return dictionary.bytesList.rows
  }

  /**
   * Prepare one extended dictionary and detector for the session.
   * @param {object} cv OpenCV runtime (window.cv)
   * @param {{ maxId?: number }} [options] max student_sr_codes.id in the conduct roster
   */
  init(cv, options = {}) {
    if (this.detector) this.dispose()

    this.cv = cv
    const capacity = dictionaryCapacityForMaxId(options.maxId)
    this.sessionCapacity = capacity

    let dictionary = cv.getPredefinedDictionary(cv.DICT_6X6_250)
    if (this._markerCount(dictionary) < capacity) {
      dictionary = cv.extendDictionary(capacity, 6, dictionary)
    }
    this.dictionary = dictionary

    this.params = new cv.aruco_DetectorParameters()
    this.refine = new cv.aruco_RefineParameters(10, 3, true)
    this.detector = new cv.aruco_ArucoDetector(dictionary, this.params, this.refine)
  }

  /**
   * Detect and decode every marker in `gray` using the session detector.
   * @returns {Array<{ id: number, rotation: number|null, confidence: number, corners: object[] }>}
   */
  decode(_cv, gray, _options = {}) {
    if (!this.cv || !this.detector) {
      throw new Error('MarkerCodec is not initialized')
    }

    const corners = new this.cv.MatVector()
    const ids = new this.cv.Mat()
    const rejected = new this.cv.MatVector()

    try {
      this.detector.detectMarkers(gray, corners, ids, rejected)
      const count = ids.rows || 0
      if (!count) return []

      const results = []
      const seen = new Set()
      for (let i = 0; i < count; i += 1) {
        const cornerMat = corners.get(i)
        try {
          const id = Number(ids.data32S[i]) + 1
          if (!Number.isInteger(id) || id < 1 || seen.has(id)) continue
          seen.add(id)
          const itemCorners = cornersFromMat(cornerMat)
          results.push({
            id,
            rotation: rotationFromCorners(itemCorners),
            confidence: 0.95,
            corners: itemCorners,
          })
        } finally {
          cornerMat.delete()
        }
      }
      return results
    } finally {
      rejected.delete()
      ids.delete()
      corners.delete()
    }
  }

  dispose() {
    this.detector?.delete()
    this.refine?.delete()
    this.params?.delete()
    this.dictionary?.delete()
    this.detector = null
    this.refine = null
    this.params = null
    this.dictionary = null
    this.sessionCapacity = 0
    this.cv = null
  }
}
