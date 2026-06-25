import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { api } from '../api/client'
import { BATCH_GROUP_PHOTO_LABEL } from '../api/constants'
import { IconCamera, IconUpload } from './icons/Icons'
import './GroupPhotoSheet.css'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function PreviewThumb({ file, onRemove }) {
  const [url, setUrl] = useState(null)
  const isVideo = file.type.startsWith('video/')

  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  if (!url) return null

  return (
    <div className="gp-preview-thumb">
      {isVideo ? (
        <video src={url} className="gp-preview-thumb__media" muted />
      ) : (
        <img src={url} alt="" className="gp-preview-thumb__media" />
      )}
      {isVideo && <div className="gp-preview-thumb__badge">VIDEO</div>}
      <button type="button" className="gp-preview-thumb__remove" onClick={onRemove} aria-label="Remove">×</button>
    </div>
  )
}

function GalleryViewer({ uploads, startIndex, onClose }) {
  const [index, setIndex] = useState(startIndex)
  const touchRef = useRef(null)

  useEffect(() => { setIndex(startIndex) }, [startIndex])

  if (!uploads.length) return null
  const safeIdx = Math.min(index, uploads.length - 1)
  const item = uploads[safeIdx]
  if (!item) return null

  const goPrev = () => setIndex((i) => Math.max(0, i - 1))
  const goNext = () => setIndex((i) => Math.min(uploads.length - 1, i + 1))

  const onTouchStart = (e) => { touchRef.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touchRef.current == null) return
    const diff = e.changedTouches[0].clientX - touchRef.current
    if (diff > 50) goPrev()
    else if (diff < -50) goNext()
    touchRef.current = null
  }

  return (
    <div className="gp-gallery-backdrop" onClick={onClose}>
      <div className="gp-gallery-viewer" onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="gp-gallery-topbar">
          <span className="gp-gallery-counter">{safeIdx + 1} / {uploads.length}</span>
          <button type="button" className="gp-gallery-close" onClick={onClose}>×</button>
        </div>

        <div className="gp-gallery-main">
          {safeIdx > 0 && (
            <button type="button" className="gp-gallery-arrow gp-gallery-arrow--left" onClick={goPrev}>‹</button>
          )}
          {item.media_type === 'video' ? (
            <video src={item.blob_url} className="gp-gallery-media" controls />
          ) : (
            <img src={item.blob_url} alt="" className="gp-gallery-media" />
          )}
          {safeIdx < uploads.length - 1 && (
            <button type="button" className="gp-gallery-arrow gp-gallery-arrow--right" onClick={goNext}>›</button>
          )}
        </div>

        <p className="gp-gallery-date">{formatDate(item.created_at)}</p>
      </div>
    </div>
  )
}

export default function GroupPhotoSheet({ open, batchId, batchName, onClose, onSuccess }) {
  const cameraInputRef = useRef(null)
  const galleryInputRef = useRef(null)
  const addMoreRef = useRef(null)

  const [step, setStep] = useState('browse')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploads, setUploads] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)
  const [error, setError] = useState('')
  const [galleryIndex, setGalleryIndex] = useState(null)

  const loadUploads = useCallback(async () => {
    if (!batchId) return
    const list = await api.getBatchGroupPhotos(batchId)
    setUploads(list)
  }, [batchId])

  useEffect(() => {
    if (open) {
      setStep('browse')
      setSelectedFiles([])
      setError('')
      setUploading(false)
      setUploadedCount(0)
      setUploadTotal(0)
      loadUploads()
    }
  }, [open, loadUploads])

  if (!open) return null

  const handleClose = () => { if (!uploading) onClose() }

  const handleFilesSelected = (fileList) => {
    const files = Array.from(fileList)
    if (files.length === 0) return
    setSelectedFiles((prev) => [...prev, ...files])
    setStep('preview')
    setError('')
  }

  const handleFileChange = (e) => {
    handleFilesSelected(e.target.files)
    e.target.value = ''
  }

  const removeFile = (idx) => {
    setSelectedFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      if (next.length === 0) setStep('browse')
      return next
    })
  }

  const handleUploadAll = async () => {
    if (selectedFiles.length === 0) return
    setUploading(true)
    setUploadTotal(selectedFiles.length)
    setUploadedCount(0)
    setError('')

    let failCount = 0
    for (let i = 0; i < selectedFiles.length; i++) {
      setUploadedCount(i + 1)
      const result = await api.uploadBatchGroupPhoto(selectedFiles[i], batchId)
      if (!result.ok) failCount++
    }

    setUploading(false)
    setSelectedFiles([])

    if (failCount > 0) {
      setError(`${failCount} file(s) failed to upload.`)
      toast.error(`${failCount} file(s) failed to upload`)
    } else {
      toast.success(`${selectedFiles.length} file(s) uploaded successfully`)
    }

    await loadUploads()
    setStep('success')
    onSuccess?.()
  }

  const goBackToBrowse = () => {
    setStep('browse')
    setError('')
  }

  return (
    <div className="group-photo-backdrop" role="presentation" onClick={handleClose}>
      <div className="group-photo-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="group-photo-sheet__handle" aria-hidden="true" />

        {/* ── STEP: BROWSE (source + existing gallery) ── */}
        {step === 'browse' && (
          <>
            <header className="group-photo-sheet__header">
              <h2 className="group-photo-sheet__title">{BATCH_GROUP_PHOTO_LABEL}</h2>
              <p className="group-photo-sheet__subtitle">{batchName} · Capture or upload photos & videos</p>
            </header>

            <div className="gp-source-row">
              <button type="button" className="gp-source-btn" onClick={() => cameraInputRef.current?.click()}>
                <IconCamera size={28} />
                <span>Camera</span>
              </button>
              <button type="button" className="gp-source-btn" onClick={() => galleryInputRef.current?.click()}>
                <IconUpload size={26} />
                <span>Upload</span>
              </button>
            </div>

            <input ref={cameraInputRef} type="file" accept="image/*,video/*" capture="environment" hidden onChange={handleFileChange} />
            <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,image/tiff,video/mp4,video/quicktime,video/3gpp,video/x-matroska,video/webm,video/x-msvideo,video/x-m4v,.heic,.heif,.mkv,.3gp,.avi,.m4v" multiple hidden onChange={handleFileChange} />

            {uploads.length > 0 && (
              <div className="gp-section">
                <p className="gp-section__title">Uploaded ({uploads.length})</p>
                <div className="gp-thumb-grid">
                  {uploads.map((u, i) => (
                    <div key={u.id} className="gp-thumb" onClick={() => setGalleryIndex(i)}>
                      {u.media_type === 'video' ? (
                        <video src={u.blob_url} className="gp-thumb__media" muted />
                      ) : (
                        <img src={u.blob_url} alt="" className="gp-thumb__media" />
                      )}
                      {u.media_type === 'video' && <div className="gp-thumb__play">▶</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button type="button" className="btn-outline gp-full-btn" onClick={handleClose}>Close</button>
          </>
        )}

        {/* ── STEP: PREVIEW selected files before upload ── */}
        {step === 'preview' && !uploading && (
          <>
            <header className="group-photo-sheet__header">
              <h2 className="group-photo-sheet__title">Review ({selectedFiles.length})</h2>
              <p className="group-photo-sheet__subtitle">Review your selection, then upload.</p>
            </header>

            <div className="gp-preview-grid">
              {selectedFiles.map((file, idx) => (
                <PreviewThumb key={`${file.name}-${idx}`} file={file} onRemove={() => removeFile(idx)} />
              ))}
              <button type="button" className="gp-preview-add" onClick={() => addMoreRef.current?.click()}>
                <span className="gp-preview-add__icon">+</span>
                <span>Add more</span>
              </button>
            </div>

            <input ref={addMoreRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,image/tiff,video/mp4,video/quicktime,video/3gpp,video/x-matroska,video/webm,video/x-msvideo,video/x-m4v,.heic,.heif,.mkv,.3gp,.avi,.m4v" multiple hidden onChange={handleFileChange} />

            {error && <p className="group-photo-sheet__error">{error}</p>}

            <div className="gp-action-row">
              <button type="button" className="btn-outline" onClick={goBackToBrowse}>Back</button>
              <button type="button" className="btn-primary" onClick={handleUploadAll}>
                Upload {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {/* ── STEP: UPLOADING progress ── */}
        {uploading && (
          <>
            <header className="group-photo-sheet__header">
              <h2 className="group-photo-sheet__title">Uploading...</h2>
            </header>

            <div className="gp-progress">
              <div className="gp-progress__bar">
                <div className="gp-progress__fill" style={{ width: `${Math.round((uploadedCount / uploadTotal) * 100)}%` }} />
              </div>
              <p className="gp-progress__text">{uploadedCount} of {uploadTotal} files</p>
            </div>
          </>
        )}

        {/* ── STEP: SUCCESS ── */}
        {step === 'success' && !uploading && (
          <>
            <header className="group-photo-sheet__header">
              <h2 className="group-photo-sheet__title">Upload Complete</h2>
              <p className="group-photo-sheet__subtitle">
                {uploads.length} photo{uploads.length !== 1 ? 's' : ''} / video{uploads.length !== 1 ? 's' : ''} saved for {batchName}.
              </p>
            </header>

            {error && <p className="group-photo-sheet__error">{error}</p>}

            {uploads.length > 0 && (
              <div className="gp-thumb-grid" style={{ marginBottom: 12 }}>
                {uploads.map((u, i) => (
                  <div key={u.id} className="gp-thumb" onClick={() => setGalleryIndex(i)}>
                    {u.media_type === 'video' ? (
                      <video src={u.blob_url} className="gp-thumb__media" muted />
                    ) : (
                      <img src={u.blob_url} alt="" className="gp-thumb__media" />
                    )}
                    {u.media_type === 'video' && <div className="gp-thumb__play">▶</div>}
                  </div>
                ))}
              </div>
            )}

            <div className="gp-action-row">
              <button type="button" className="btn-outline" onClick={goBackToBrowse}>Upload More</button>
              <button type="button" className="btn-primary" onClick={handleClose}>Done</button>
            </div>
          </>
        )}
      </div>

      {galleryIndex !== null && uploads.length > 0 && (
        <GalleryViewer
          uploads={uploads}
          startIndex={galleryIndex}
          onClose={() => setGalleryIndex(null)}
        />
      )}
    </div>
  )
}

export { formatDate as formatGroupPhotoDate }
