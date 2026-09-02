/**
 * Card orientation helpers — independent of marker technology.
 *
 * Matches backend ``option_from_rotation`` / ``rotation_from_corners``.
 */

export function cornerAngle(corners) {
  if (!corners || corners.length < 2) return null
  const dx = corners[1].x - corners[0].x
  const dy = corners[1].y - corners[0].y
  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI
  return ((degrees % 360) + 360) % 360
}

export function rotationFromCorners(corners) {
  const angle = cornerAngle(corners)
  if (angle == null) return null
  if (angle < 45 || angle >= 315) return 0
  if (angle < 135) return 90
  if (angle < 225) return 180
  return 270
}

export function optionFromRotation(rotation) {
  if (rotation === 0) return 'A'
  if (rotation === 180) return 'C'
  // OpenCV.js in the browser buckets left/right 90° off from Python/card print
  // convention — physical B (right edge up) reads as 270°, D (left edge up) as 90°.
  if (rotation === 90) return 'D'
  if (rotation === 270) return 'B'
  return null
}
