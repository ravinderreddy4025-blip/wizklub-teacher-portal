import { useEffect, useRef, useState } from 'react'
import { ArUcoMarkerCodec } from '../utils/scanner/markerCodec/arucoMarkerCodec'
import { loadOpenCv } from '../utils/scanner/loadOpenCv'
import { resolveStudentFromSrCodeId } from '../utils/scanner/studentLookup'
import { optionFromRotation } from '../utils/scanner/orientation'

const SCAN_INTERVAL_MS = 200

function maxSrCodeIdFromLookup(lookup) {
  if (!lookup?.size) return 0
  let max = 0
  for (const id of lookup.keys()) {
    if (id > max) max = id
  }
  return max
}

function cameraError(err) {
  if (err?.name === 'NotAllowedError') {
    return 'Camera permission was denied. Allow camera access, then reopen the scanner.'
  }
  if (err?.name === 'NotFoundError') {
    return 'No camera was found on this device.'
  }
  return err?.message || 'Unable to start the camera.'
}

function scanKey(questionId, studentId) {
  return `${questionId}:${studentId}`
}

function mergeSessionDetections(previous, incoming) {
  if (!incoming.length) return previous
  const byId = new Map(previous.map((item) => [item.studentId || item.studentQrCodeId, item]))
  for (const item of incoming) {
    byId.set(item.studentId || item.studentQrCodeId, item)
  }
  return [...byId.values()]
}

function drawOverlay(canvas, detections, width, height) {
  if (!canvas) return
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, width, height)

  for (const detection of detections) {
    const points = detection.corners
    const label = `${detection.displayName || detection.studentId || detection.studentQrCodeId} : ${detection.answer || '?'}`

    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y)
    ctx.closePath()
    ctx.lineWidth = 3
    ctx.strokeStyle = '#22c55e'
    ctx.stroke()

    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length
    ctx.font = 'bold 18px sans-serif'
    ctx.fillStyle = '#22c55e'
    ctx.fillText(label, x - 80, y)
  }
}

// Survives scanner close/reopen for the current question. Cleared only when
// the teacher changes question (Next/Previous) via clearAlreadyScanned().
const alreadyScanned = new Set()

export function clearAlreadyScanned() {
  alreadyScanned.clear()
}

export function useScanner({ studentLookup, onCaptured, questionId } = {}) {
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const busyRef = useRef(false)
  const studentLookupRef = useRef(studentLookup)
  const onCapturedRef = useRef(onCaptured)
  const questionIdRef = useRef(questionId)
  const [status, setStatus] = useState('starting')
  const [detections, setDetections] = useState([])
  const [error, setError] = useState('')

  studentLookupRef.current = studentLookup
  onCapturedRef.current = onCaptured
  questionIdRef.current = questionId

  useEffect(() => {
    let stopped = false
    let stream = null
    let rafId = 0
    let lastScanAt = 0
    const markerCodec = new ArUcoMarkerCodec()

    const frame = document.createElement('canvas')
    const frameCtx = frame.getContext('2d', { willReadFrequently: true })

    function stop() {
      stopped = true
      if (rafId) {
        window.cancelAnimationFrame(rafId)
        rafId = 0
      }
      stream?.getTracks().forEach((track) => track.stop())
      if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null
      stream = null
      const overlay = overlayRef.current
      if (overlay) {
        const ctx = overlay.getContext('2d')
        ctx?.clearRect(0, 0, overlay.width, overlay.height)
      }
      markerCodec.dispose()
    }

    function fail(err) {
      const closed = stopped
      stop()
      if (!closed) {
        console.error('Error', err)
        setError(cameraError(err))
        setStatus('error')
      }
    }

    function detectFrame() {
      if (stopped || busyRef.current) return

      const video = videoRef.current
      const cv = window.cv
      if (!cv?.Mat || !video?.videoWidth) return

      busyRef.current = true
      let src
      let gray
      try {
        frame.width = video.videoWidth
        frame.height = video.videoHeight
        frameCtx.drawImage(video, 0, 0, frame.width, frame.height)

        src = cv.imread(frame)
        gray = new cv.Mat()
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
        const lookup = studentLookupRef.current
        const activeQuestionId = questionIdRef.current
        const decoded = markerCodec.decode(cv, gray)
        const visible = []
        const newlyRecorded = []

        for (const item of decoded) {
          const studentQrCodeId = Number(item.id)
          const resolved = resolveStudentFromSrCodeId(studentQrCodeId, lookup)
          if (!resolved) continue

          const answer = optionFromRotation(item.rotation)
          if (!answer) continue

          const studentId = resolved.studentId
          const scan = {
            studentQrCodeId,
            answer,
            confidence: item.confidence,
            studentId,
          }
          const overlayItem = {
            ...scan,
            displayName: resolved.displayName,
            username: resolved.username,
            corners: item.corners,
          }
          visible.push(overlayItem)

          if (!activeQuestionId || !studentId) continue

          const key = scanKey(activeQuestionId, studentId)
          if (alreadyScanned.has(key)) continue

          alreadyScanned.add(key)
          onCapturedRef.current?.(scan)
          newlyRecorded.push(overlayItem)
        }

        if (newlyRecorded.length > 0) {
          setDetections((prev) => mergeSessionDetections(prev, newlyRecorded))
        }
        drawOverlay(overlayRef.current, visible, frame.width, frame.height)
      } catch (err) {
        fail(err)
      } finally {
        gray?.delete()
        src?.delete()
        busyRef.current = false
      }
    }

    function tick(now) {
      if (stopped) return
      rafId = window.requestAnimationFrame(tick)
      if (busyRef.current) return
      if (now - lastScanAt < SCAN_INTERVAL_MS) return
      lastScanAt = now
      detectFrame()
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        if (stopped) return stop()

        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        if (stopped) return stop()
        setStatus('live')

        await loadOpenCv()
        if (stopped) return stop()

        const maxStudentQrCodeId = maxSrCodeIdFromLookup(studentLookupRef.current)
        markerCodec.init(window.cv, { maxId: maxStudentQrCodeId })

        setStatus('ready')
        lastScanAt = 0
        rafId = window.requestAnimationFrame(tick)
      } catch (err) {
        fail(err)
      }
    }

    void start()
    return stop
  }, [])

  return { videoRef, overlayRef, status, detections, error }
}
