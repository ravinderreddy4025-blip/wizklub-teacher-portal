import { useCallback, useEffect, useRef, useState } from 'react'
import { ArUcoMarkerCodec } from '../utils/scanner/markerCodec/arucoMarkerCodec'
import { loadOpenCv } from '../utils/scanner/loadOpenCv'
import { resolveStudentFromSrCodeId } from '../utils/scanner/studentLookup'
import { optionFromRotation } from '../utils/scanner/orientation'

const READ_ERROR = 'Unable to read SR code.\nPlease rescan.'

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

export function useScanner({ studentLookup, onCaptured } = {}) {
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const runCapture = useRef(() => {})
  const capturingRef = useRef(false)
  const studentLookupRef = useRef(studentLookup)
  const onCapturedRef = useRef(onCaptured)
  const [status, setStatus] = useState('starting')
  const [detections, setDetections] = useState([])
  const [captureNotice, setCaptureNotice] = useState('')
  const [error, setError] = useState('')
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    studentLookupRef.current = studentLookup
    onCapturedRef.current = onCaptured
  })

  const capture = useCallback(() => {
    if (capturingRef.current) return
    runCapture.current()
  }, [])

  useEffect(() => {
    let stopped = false
    let stream = null
    const markerCodec = new ArUcoMarkerCodec()

    const frame = document.createElement('canvas')
    const frameCtx = frame.getContext('2d', { willReadFrequently: true })

    function stop() {
      stopped = true
      runCapture.current = () => {}
      stream?.getTracks().forEach((track) => track.stop())
      if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null
      stream = null
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

    function detect() {
      if (stopped || capturingRef.current) return
      capturingRef.current = true
      setCapturing(true)

      window.requestAnimationFrame(() => {
        const video = videoRef.current
        const cv = window.cv
        if (stopped || !cv?.Mat || !video?.videoWidth) {
          capturingRef.current = false
          setCapturing(false)
          return
        }

        frame.width = video.videoWidth
        frame.height = video.videoHeight
        frameCtx.drawImage(video, 0, 0, frame.width, frame.height)

        const src = cv.imread(frame)
        const gray = new cv.Mat()

        try {
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
          const lookup = studentLookupRef.current
          const decoded = markerCodec.decode(cv, gray)
          const found = []

          for (const item of decoded) {
            const studentQrCodeId = Number(item.id)
            const resolved = resolveStudentFromSrCodeId(studentQrCodeId, lookup)
            if (!resolved) continue

            const answer = optionFromRotation(item.rotation)
            if (!answer) continue

            const scan = {
              studentQrCodeId,
              answer,
              confidence: item.confidence,
              studentId: resolved.studentId,
            }
            onCapturedRef.current?.(scan)
            found.push({
              ...scan,
              displayName: resolved.displayName,
              username: resolved.username,
              corners: item.corners,
            })
          }

          setDetections(found)
          setCaptureNotice(found.length === 0 ? READ_ERROR : '')
          drawOverlay(overlayRef.current, found, frame.width, frame.height)
        } catch (err) {
          fail(err)
        } finally {
          gray.delete()
          src.delete()
          capturingRef.current = false
          setCapturing(false)
        }
      })
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

        runCapture.current = detect
        setStatus('ready')
      } catch (err) {
        fail(err)
      }
    }

    void start()
    return stop
  }, [])

  return { videoRef, overlayRef, status, detections, captureNotice, error, capture, capturing }
}
