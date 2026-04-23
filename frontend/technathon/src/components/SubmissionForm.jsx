/**
 * Student submission UI for signed URLs `/submit/:studentId/:exp/:sig`.
 * Loads/saves via `/api/submissions/by-link/...`; uploads use UPLOAD_API_BASE.
 * Roster-locked fields explained in: ../../../docs/file-notes/client/src/components/SubmissionForm.jsx.md
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { UploadCloud, File, CheckCircle, AlertCircle, Loader, Pencil, X } from 'lucide-react';
import { API_BASE, API_BASE_HINT, UPLOAD_API_BASE, UPLOAD_API_HINT } from '../apiConfig';
import { formatNetworkError, notifyError, notifySuccess, notifyUploadError } from '../utils/toastNotify';

// ── Technathon 2026 Banner ─────────────────────────────────
const TechnathonBanner = () => (
  <div style={{
    position: 'relative',
    borderRadius: '20px',
    overflow: 'hidden',
    background: 'linear-gradient(120deg, #F6A623 0%, #EF5A2C 55%, #E84B20 100%)',
    maxWidth: '960px',
    margin: '0 auto 2.5rem auto',
    minHeight: '180px',
    display: 'flex',
    alignItems: 'stretch',
    boxShadow: '0 12px 40px rgba(239,90,44,0.35)',
  }}>

    <div style={{
      position: 'absolute', inset: 0, zIndex: 0,
      backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.18) 1.2px, transparent 1.2px)',
      backgroundSize: '18px 18px',
      pointerEvents: 'none',
    }} />

    <div style={{
      position: 'absolute', top: 0, left: '-60%', width: '45%', height: '100%',
      background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.07), transparent)',
      transform: 'skewX(-15deg)', zIndex: 0, pointerEvents: 'none',
    }} />

    <div style={{
      position: 'relative', zIndex: 1,
      flex: '0 1 42%', padding: '1.75rem 1.25rem 1.75rem 1.75rem',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      minWidth: 'min(100%, 220px)',
    }}>
      <p style={{
        color: 'rgba(255,255,255,0.88)', fontSize: '0.95rem',
        fontWeight: 500, lineHeight: 1.4, marginBottom: '0.5rem',
      }}>
        Challenge Your Coding Skills with
      </p>
      <h2 style={{
        color: '#fff', fontSize: 'clamp(1.4rem, 4vw, 2rem)',
        fontWeight: 900, lineHeight: 1.15,
        textShadow: '0 2px 8px rgba(0,0,0,0.18)',
        letterSpacing: '-0.01em',
      }}>
        Wizklub<br />Technathon 2026
      </h2>
    </div>

    <div style={{
      position: 'relative', zIndex: 1,
      flex: '1 1 58%', minHeight: '180px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0.5rem 0.75rem 0.5rem 0',
    }}>
      <img
        src={`${import.meta.env.BASE_URL}banner-technathon.png`}
        alt="Developers building software together"
        style={{
          width: '100%',
          maxHeight: '200px',
          objectFit: 'contain',
          objectPosition: 'center',
          filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.2))',
          display: 'block',
        }}
        onError={e => { e.target.style.display = 'none'; }}
      />
    </div>

  </div>
);

/** Hard cap on server and client — files over this are rejected before any cloud upload API runs. */
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
/** Same limit as `server/routes/upload.js` document multer `fileSize`. */
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/** Shown under all video upload zones — duration varies by bitrate; HD is the common bottleneck. */
const VIDEO_UPLOAD_HINT =
  'Maximum 300 MB (files over 300 MB are not uploaded). At typical phone/camera HD quality, that is usually about 5–8 minutes of video; lower resolution (720p / 480p) often fits more minutes in the same size.';

const DOCUMENT_UPLOAD_HINT =
  'Maximum 5 MB for PDF or images (files over 5 MB are not uploaded).';

const emptyForm = () => ({
  studentId: '',
  name: '',
  grade: '',
  schoolName: '',
  email: '',
  username: '',
  admissionNumber: '',
  projectTitle: '',
  idea: '',
  problemStatement: '',
  solution: '',
  techUsed: '',
  impact: '',
  videoUrl: '',
  documentUrl: '',
});

const ROSTER_LOCKED_FIELDS = ['name', 'grade', 'schoolName', 'username', 'admissionNumber'];

const SubmissionForm = () => {
  const { studentId: sidParam, exp, sig } = useParams();

  const [formData, setFormData] = useState(emptyForm);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [savedMessage, setSavedMessage] = useState(null);
  const [uploading, setUploading] = useState({ video: false, document: false });
  const [uploadedNames, setUploadedNames] = useState({ video: '', document: '' });
  const [editModalOpen, setEditModalOpen] = useState(false);

  const linkApiPath = useCallback(() => {
    if (!sidParam || !exp || !sig) return null;
    return `/api/submissions/by-link/${encodeURIComponent(sidParam)}/${exp}/${sig}`;
  }, [sidParam, exp, sig]);

  useEffect(() => {
    const path = linkApiPath();
    if (!path) {
      setLoadError('This URL is incomplete. Open the full link sent by your organiser.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`${API_BASE}${path}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json.message || 'Unable to open this submission link.');
          setMeta(null);
          return;
        }
        setMeta(json.meta);
        if (json.data) {
          setFormData({
            ...emptyForm(),
            ...json.data,
            ...(json.meta?.lockedProfile || {}),
            studentId: json.meta?.studentId || sidParam || '',
          });
          setUploadedNames({ video: json.data.videoUrl ? 'Uploaded' : '', document: json.data.documentUrl ? 'Uploaded' : '' });
        } else {
          setFormData(prev => ({ ...prev, studentId: json.meta?.studentId || sidParam || '' }));
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(formatNetworkError(e?.message, API_BASE_HINT, 'load this form'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [linkApiPath, sidParam]);

  const formLocked = meta && !meta.canEdit;
  const hasSubmittedOnce = Boolean(meta?.firstSubmittedAt);
  const editWindowHours = Number(meta?.editWindowHours) > 0 ? Number(meta.editWindowHours) : 2;
  const fieldDisabled = (forModal) => {
    if (formLocked) return true;
    if (hasSubmittedOnce && !forModal) return true;
    return false;
  };

  const rosterFieldsLocked = Boolean(meta?.rosterFieldsLocked);

  const handleInputChange = (e) => {
    if (formLocked || (hasSubmittedOnce && !editModalOpen)) return;
    const { name, value } = e.target;
    if (name === 'studentId') return;
    if (rosterFieldsLocked && ROSTER_LOCKED_FIELDS.includes(name)) return;
    if (name === 'grade' && hasSubmittedOnce && editModalOpen) return;
    setFormData(prev => ({ ...prev, [name]: value }));
    setSavedMessage(null);
  };

  const handleFileUpload = async (e, field) => {
    if (formLocked || (hasSubmittedOnce && !editModalOpen)) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = field === 'videoUrl';
    if (isVideo && file.size > MAX_VIDEO_BYTES) {
      notifyError(
        `This video is over 300 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB). Choose a smaller file — it will not be sent to the server.`,
        { toastId: 'video-too-large' },
      );
      e.target.value = '';
      return;
    }

    if (!isVideo && file.size > MAX_DOCUMENT_BYTES) {
      notifyError(
        `This file is over 5 MB (${(file.size / (1024 * 1024)).toFixed(2)} MB). PDFs and images must be 5 MB or smaller — it will not be sent to the server.`,
        { toastId: 'document-too-large' },
      );
      e.target.value = '';
      return;
    }

    const endpoint = isVideo ? '/api/upload/video' : '/api/upload/document';

    setUploading(prev => ({ ...prev, [isVideo ? 'video' : 'document']: true }));

    try {
      const data = new FormData();
      data.append('file', file);
      data.append('studentId', String(formData.studentId || sidParam || '').trim());

      const res = await fetch(`${UPLOAD_API_BASE}${endpoint}`, {
        method: 'POST',
        body: data,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[upload] request failed', {
          endpoint,
          status: res.status,
          studentId: String(formData.studentId || sidParam || '').trim() || null,
          filename: file.name,
          mimetype: file.type,
          size: file.size,
          response: err,
        });
        throw new Error(err.message || 'Upload failed');
      }

      const result = await res.json();
      setFormData(prev => ({ ...prev, [field]: result.url }));
      setUploadedNames(prev => ({
        ...prev,
        [isVideo ? 'video' : 'document']: file.name,
      }));
      setSavedMessage(null);
      notifySuccess(isVideo ? 'Video uploaded successfully' : 'Document uploaded successfully');
    } catch (err) {
      console.error('[upload] exception', {
        endpoint,
        studentId: String(formData.studentId || sidParam || '').trim() || null,
        filename: file.name,
        mimetype: file.type,
        size: file.size,
        message: err?.message || String(err),
      });
      notifyUploadError(err, UPLOAD_API_HINT);
    } finally {
      setUploading(prev => ({ ...prev, [isVideo ? 'video' : 'document']: false }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formLocked) return false;
    if (hasSubmittedOnce && !editModalOpen) return false;
    const path = linkApiPath();
    if (!path) return false;

    setSubmitting(true);
    setSubmitError(null);
    setSavedMessage(null);
    try {
      const { studentId: _s, ...rest } = formData;
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rest, finalized: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || `Server error: ${res.status}`);
      if (json.meta) setMeta(json.meta);
      if (json.data) {
        setFormData(prev => ({
          ...prev,
          ...json.data,
          ...(json.meta?.lockedProfile || {}),
          studentId: json.meta?.studentId || prev.studentId,
        }));
      }
      setSavedMessage(json.message || 'Saved successfully.');
      return true;
    } catch (err) {
      const msg = formatNetworkError(err?.message, API_BASE_HINT, 'save your submission');
      setSubmitError(msg);
      notifyError(msg, { toastId: 'submit-error' });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setSubmitError(null);
  };

  useEffect(() => {
    if (!editModalOpen) return undefined;
    const onKey = (ev) => {
      if (ev.key === 'Escape') {
        setEditModalOpen(false);
        setSubmitError(null);
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [editModalOpen]);

  const FileUpload = ({ field, accept, label, hint, icon, inputId, required, disabled: dis }) => {
    const isVideo = field === 'videoUrl';
    const key = isVideo ? 'video' : 'document';
    const isUploading = uploading[key];
    const uploadedName = uploadedNames[key];
    const hasUrl = !!formData[field];

    return (
      <div className="form-group">
        <label className="form-label">{label}</label>
        {hint && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '-0.25rem', marginBottom: '0.5rem' }}>{hint}</p>
        )}
        <div className="file-upload-wrapper" style={{ borderColor: hasUrl ? 'var(--color-brand-mid-1)' : undefined, background: hasUrl ? 'rgba(246,172,65,0.05)' : undefined, opacity: dis ? 0.75 : 1 }}>
          {isUploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <Loader size={30} className="file-upload-icon" style={{ animation: 'spin 1s linear infinite' }} />
              <p style={{ fontWeight: 600, color: 'var(--color-brand-dark-1)' }}>Uploading to cloud...</p>
            </div>
          ) : hasUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={30} style={{ color: 'var(--color-brand-mid-1)' }} />
              <p style={{ fontWeight: 700, color: 'var(--color-brand-mid-1)' }}>Uploaded!</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', wordBreak: 'break-all', maxWidth: '260px' }}>{uploadedName}</p>
              {!dis && (
                <>
                  <input type="file" accept={accept} onChange={(e) => handleFileUpload(e, field)} style={{ display: 'none' }} id={inputId} />
                  <label htmlFor={inputId} className="btn btn-secondary" style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.4rem 0.9rem' }}>
                    Replace File
                  </label>
                </>
              )}
            </div>
          ) : (
            <>
              {React.createElement(icon, { className: 'file-upload-icon' })}
              <p style={{ fontWeight: 600 }}>Click or drag to upload</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>File will be securely stored on cloud</p>
              {!dis && (
                <>
                  <input type="file" accept={accept} onChange={(e) => handleFileUpload(e, field)} style={{ display: 'none' }} id={inputId} required={required && !hasUrl} />
                  <label htmlFor={inputId} className="btn btn-secondary" style={{ marginTop: '1rem' }}>
                    Select File
                  </label>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderDynamicFields = (idPrefix, dis) => {
    const { grade } = formData;
    if (!grade) return null;

    if (grade === '1' || grade === '2') {
      return (
        <div className="animate-fade-in">
          <h3 style={{ margin: '2rem 0 1rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Project Details (Grade {grade})
          </h3>
          <div className="form-group">
            <label className="form-label">Write your Idea</label>
            <textarea name="idea" className="form-control" placeholder="Tell us about your awesome idea!" value={formData.idea} onChange={handleInputChange} required disabled={dis}></textarea>
          </div>
          <FileUpload field="videoUrl" accept="video/*" label="Upload Video (Required)" hint={VIDEO_UPLOAD_HINT} icon={UploadCloud} inputId={`${idPrefix}video-upload-12`} required disabled={dis} />
          <FileUpload field="documentUrl" accept=".pdf,image/*" label="Upload Drawing Document (PDF) – Optional" hint={DOCUMENT_UPLOAD_HINT} icon={File} inputId={`${idPrefix}doc-upload-12`} disabled={dis} />
        </div>
      );
    }

    if (['3', '4', '5'].includes(grade)) {
      return (
        <div className="animate-fade-in">
          <h3 style={{ margin: '2rem 0 1rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Project Details (Grade {grade})
          </h3>
          <div className="form-group">
            <label className="form-label">Problem Statement</label>
            <textarea name="problemStatement" className="form-control" placeholder="What problem are you solving?" value={formData.problemStatement} onChange={handleInputChange} required disabled={dis}></textarea>
          </div>
          <div className="form-group">
            <label className="form-label">Solution</label>
            <textarea name="solution" className="form-control" placeholder="What is your solution?" value={formData.solution} onChange={handleInputChange} required disabled={dis}></textarea>
          </div>
          <FileUpload field="videoUrl" accept="video/*" label="Upload Video (Required)" hint={VIDEO_UPLOAD_HINT} icon={UploadCloud} inputId={`${idPrefix}video-upload-35`} required disabled={dis} />
          <FileUpload field="documentUrl" accept=".pdf,image/*" label="Upload Drawing Document (PDF) – Optional" hint={DOCUMENT_UPLOAD_HINT} icon={File} inputId={`${idPrefix}doc-upload-35`} disabled={dis} />
        </div>
      );
    }

    if (['6', '7', '8', '9'].includes(grade)) {
      return (
        <div className="animate-fade-in">
          <h3 style={{ margin: '2rem 0 1rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Project Details (Grade {grade})
          </h3>
          <div className="form-group">
            <label className="form-label">Problem Statement</label>
            <textarea name="problemStatement" className="form-control" placeholder="Describe the real-world problem your project addresses..." value={formData.problemStatement} onChange={handleInputChange} required disabled={dis}></textarea>
          </div>
          <div className="form-group">
            <label className="form-label">Solution</label>
            <textarea name="solution" className="form-control" placeholder="Explain how your project solves the problem step by step..." value={formData.solution} onChange={handleInputChange} required disabled={dis}></textarea>
          </div>
          <div className="form-group">
            <label className="form-label">Technology Used</label>
            <textarea name="techUsed" className="form-control" placeholder="e.g. Arduino, Python, Raspberry Pi, sensors, mobile app..." value={formData.techUsed} onChange={handleInputChange} required disabled={dis}></textarea>
          </div>
          <div className="form-group">
            <label className="form-label">Impact</label>
            <textarea name="impact" className="form-control" placeholder="Who benefits from your project and how does it improve their lives?" value={formData.impact} onChange={handleInputChange} required disabled={dis}></textarea>
          </div>
          <FileUpload field="videoUrl" accept="video/*" label="Upload Video (Required)" hint={VIDEO_UPLOAD_HINT} icon={UploadCloud} inputId={`${idPrefix}video-upload-69`} required disabled={dis} />
          <FileUpload field="documentUrl" accept=".pdf,image/*" label="Upload Additional Files – Optional" hint={DOCUMENT_UPLOAD_HINT} icon={File} inputId={`${idPrefix}doc-upload-69`} disabled={dis} />
        </div>
      );
    }

    return null;
  };

  const mainFieldDisabled = fieldDisabled(false);
  const modalFieldDisabled = fieldDisabled(true);
  const lockedProfileStyle = { background: '#f3f4f6', cursor: 'not-allowed' };

  const renderFormInner = (idPrefix, dis, lockGrade = false) => {
    const profileLock = rosterFieldsLocked;
    const nameSchoolGradeLocked = dis || profileLock;
    const gradeLocked = dis || lockGrade || profileLock;
    return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Student ID</label>
          <input type="text" name="studentId" className="form-control" value={formData.studentId} readOnly disabled style={lockedProfileStyle} />
        </div>
        {profileLock && (
          <>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Username</label>
              <input type="text" name="username" className="form-control" value={formData.username || ''} readOnly disabled style={lockedProfileStyle} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Admission number</label>
              <input
                type="text"
                name="admissionNumber"
                className="form-control"
                value={formData.admissionNumber || ''}
                placeholder="Not provided"
                readOnly
                disabled
                style={lockedProfileStyle}
              />
            </div>
          </>
        )}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Student Name</label>
          <input type="text" name="name" className="form-control" placeholder="Enter your full name" value={formData.name} onChange={handleInputChange} required disabled={nameSchoolGradeLocked} style={profileLock ? lockedProfileStyle : undefined} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">School Name</label>
          <input type="text" name="schoolName" className="form-control" placeholder="Enter your school name" value={formData.schoolName} onChange={handleInputChange} required disabled={nameSchoolGradeLocked} style={profileLock ? lockedProfileStyle : undefined} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Grade / Class</label>
          <select name="grade" className="form-control" value={formData.grade} onChange={handleInputChange} required disabled={gradeLocked} style={(lockGrade || profileLock) ? lockedProfileStyle : undefined}>
            <option value="">Select your grade</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <option key={num} value={num.toString()}>Grade {num}</option>
            ))}
          </select>
          {lockGrade && !profileLock && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem', marginBottom: 0 }}>
              Grade cannot be changed after your first submission.
            </p>
          )}
          {profileLock && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem', marginBottom: 0 }}>
              Your school has set your profile; these fields cannot be edited here.
            </p>
          )}
        </div>
      </div>

      <div className="form-group" style={{ marginTop: '1.5rem' }}>
        <label className="form-label">Email ID</label>
        <input
          type="email"
          name="email"
          className="form-control"
          placeholder="Enter your email id"
          value={formData.email || ''}
          onChange={handleInputChange}
          required
          disabled={dis}
        />
      </div>

      <div className="form-group" style={{ marginTop: '1.5rem' }}>
        <label className="form-label">Project Title</label>
        <input type="text" name="projectTitle" className="form-control" placeholder="e.g. Smart Dustbin using Arduino" value={formData.projectTitle} onChange={handleInputChange} required disabled={dis} />
      </div>

      {renderDynamicFields(idPrefix, dis)}

      {formData.grade && !dis && (
        <div style={{ marginTop: '2.5rem' }}>
          {submitError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.875rem 1rem', marginBottom: '1rem', color: '#dc2626' }}>
              <AlertCircle size={18} />
              <span style={{ fontSize: '0.9rem' }}>{submitError}</span>
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || uploading.video || uploading.document}
            style={{ width: '100%', padding: '1rem', fontSize: '1.125rem', opacity: (submitting || uploading.video || uploading.document) ? 0.7 : 1 }}
          >
            {submitting ? 'Saving...' : uploading.video || uploading.document ? 'Uploading files...' : (hasSubmittedOnce ? 'Save changes' : 'Finalize & Submit Project')}
          </button>
        </div>
      )}
    </>
    );
  };

  if (loading) {
    return (
      <div className="card animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center', padding: '4rem 2rem' }}>
        <Loader size={40} className="file-upload-icon" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading your form…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '1.25rem', color: '#b91c1c' }}>
          <AlertCircle size={22} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <p style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Cannot open form</p>
            <p style={{ fontSize: '0.95rem', lineHeight: 1.5 }}>{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <TechnathonBanner />
      <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'inline-block' }}>
            Technathon Submission Portal
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Your student ID is fixed for this link. You cannot submit for another student.
          </p>
        </div>

        {meta?.linkExpiresAt && (
          <div style={{ background: 'rgba(246,172,65,0.12)', border: '1px solid rgba(239,90,44,0.25)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
            <strong>Link active until:</strong>{' '}
            {new Date(meta.linkExpiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        )}

        <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.875rem', color: '#1e40af' }}>
          After filling and submitting this form once, you can edit it for <strong>{editWindowHours} hours</strong>.
        </div>

        {rosterFieldsLocked && (
          <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.875rem', color: '#1e40af' }}>
            Your name, school, grade, username, and admission number were provided by your school and cannot be changed on this form.
          </div>
        )}

        {formLocked && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.875rem 1rem', marginBottom: '1.25rem', color: '#b91c1c' }}>
            <AlertCircle size={18} />
            <span style={{ fontSize: '0.9rem' }}>
              The 2-hour edit window after your first submission has ended. This page is read-only. Contact the organiser if you need changes.
            </span>
          </div>
        )}

        {meta?.firstSubmittedAt && meta.canEdit && meta.editDeadline && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '0.875rem 1rem', marginBottom: '1.25rem', color: '#047857' }}>
            <CheckCircle size={18} />
            <span style={{ fontSize: '0.9rem' }}>
              You can edit your submission for {editWindowHours} hours after first submit, until{' '}
              <strong>{new Date(meta.editDeadline).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</strong>.
            </span>
          </div>
        )}

        {savedMessage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '0.875rem 1rem', marginBottom: '1.25rem', color: '#047857' }}>
            <CheckCircle size={18} />
            <span style={{ fontSize: '0.9rem' }}>{savedMessage}</span>
          </div>
        )}

        {!hasSubmittedOnce && (
          <form onSubmit={handleSubmit}>
            {renderFormInner('', mainFieldDisabled, false)}
          </form>
        )}

        {hasSubmittedOnce && (
          <div className="animate-fade-in" style={{ padding: '0.25rem 0 0.5rem' }}>
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(246,172,65,0.08) 0%, rgba(239,90,44,0.06) 100%)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '1.25rem 1.35rem',
                marginBottom: '1.5rem',
              }}
            >
              <p style={{ fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Submission received</p>
              <dl style={{ margin: 0, display: 'grid', gap: '0.5rem', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  <dt style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '6.5rem' }}>Student</dt>
                  <dd style={{ margin: 0 }}>{formData.name || '—'}</dd>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  <dt style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '6.5rem' }}>Grade</dt>
                  <dd style={{ margin: 0 }}>{formData.grade ? `Grade ${formData.grade}` : '—'}</dd>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  <dt style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '6.5rem' }}>Project</dt>
                  <dd style={{ margin: 0 }}>{formData.projectTitle || '—'}</dd>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  <dt style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '6.5rem' }}>Email</dt>
                  <dd style={{ margin: 0 }}>{formData.email || '—'}</dd>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                  <dt style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '6.5rem' }}>Video</dt>
                  <dd style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {formData.videoUrl ? (
                      <>
                        <CheckCircle size={16} style={{ color: 'var(--color-brand-mid-1)' }} />
                        <span>Uploaded</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {meta?.canEdit && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setSubmitError(null);
                  setEditModalOpen(true);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem' }}
              >
                <Pencil size={18} aria-hidden />
                Edit submission
              </button>
            )}
          </div>
        )}
      </div>

      {editModalOpen && meta?.canEdit && !formLocked && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1050,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '1.5rem',
            overflowY: 'auto',
          }}
          onClick={closeEditModal}
          onKeyDown={(e) => e.key === 'Escape' && closeEditModal()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-submission-title"
            className="card animate-fade-in"
            style={{
              maxWidth: '800px',
              width: '100%',
              margin: '2vh auto',
              position: 'relative',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' }}>
              <h2 id="edit-submission-title" style={{ margin: 0, fontSize: '1.25rem' }}>
                Edit your submission
              </h2>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeEditModal}
                aria-label="Close"
                style={{ padding: '0.5rem', minWidth: 'auto', lineHeight: 1 }}
              >
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '-0.5rem', marginBottom: '1.25rem' }}>
              You can edit for {editWindowHours} hours after first submit. Save when you are done.
            </p>
            <form
              onSubmit={async (e) => {
                const ok = await handleSubmit(e);
                if (ok) setEditModalOpen(false);
              }}
            >
              {renderFormInner('modal-', modalFieldDisabled, true)}
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default SubmissionForm;
