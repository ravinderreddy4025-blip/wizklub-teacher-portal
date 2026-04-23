/**
 * Admin dashboard after login: roster table, Excel import, create-student+link, bulk links, export.
 * API: `/api/admin/*`, `/api/submissions/export`. Doc: ../../../docs/file-notes/client/src/components/AdminDashboard.jsx.md
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, Users, Video, Download, RefreshCw,
  AlertCircle, X, FileText, Lightbulb, Cpu, Zap,
  FileSpreadsheet, Play, ExternalLink, LogOut, Shield, Link2, Copy, Check,
} from 'lucide-react';
import { API_BASE, API_BASE_HINT, publicSpaBaseUrl } from '../apiConfig';
import { formatNetworkError, notifyCopyError, notifyError, notifySuccess } from '../utils/toastNotify';

const IMPORT_AUTO_SELECT_LIMIT = 1000;

// ── Auth helpers ───────────────────────────────────────────
const getToken = () => localStorage.getItem('adminToken');

const isTokenValid = () => {
  const token  = getToken();
  const expStr = localStorage.getItem('adminTokenExp');
  if (!token || !expStr) return false;
  return Date.now() < parseInt(expStr, 10);
};

const clearAuth = () => {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminTokenExp');
};

/** Authenticated fetch — auto-appends Bearer token; redirects on 401/403 */
const authFetch = async (url, options = {}, navigate) => {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401 || res.status === 403) {
    clearAuth();
    navigate('/admin/login');
    throw new Error('Session expired. Please log in again.');
  }
  return res;
};

function parseUrlSafe(value) {
  try {
    return new URL(String(value || '').trim());
  } catch {
    return null;
  }
}

function isAwsSignedMediaUrl(value) {
  const u = parseUrlSafe(value);
  if (!u) return false;
  return u.searchParams.has('X-Amz-Signature') && u.searchParams.has('X-Amz-Expires');
}

function sameMediaObject(a, b) {
  const ua = parseUrlSafe(a);
  const ub = parseUrlSafe(b);
  if (!ua || !ub) return false;
  return ua.origin === ub.origin && ua.pathname === ub.pathname;
}

function logBrowserRefreshedSignedLinks(prevRows, nextRows) {
  const prevById = new Map(
    (Array.isArray(prevRows) ? prevRows : [])
      .map((row) => [String(row?.studentId || row?.username || ''), row])
      .filter(([id]) => Boolean(id)),
  );
  for (const row of Array.isArray(nextRows) ? nextRows : []) {
    const sid = String(row?.studentId || row?.username || '').trim();
    if (!sid) continue;
    const prev = prevById.get(sid);
    if (!prev) continue;
    for (const field of ['videoUrl', 'documentUrl']) {
      const before = String(prev?.[field] || '').trim();
      const after = String(row?.[field] || '').trim();
      if (!before || !after || before === after) continue;
      if (!sameMediaObject(before, after)) continue;
      if (!isAwsSignedMediaUrl(after)) continue;
      console.info('[media-link] refreshed in browser', {
        studentId: sid,
        field,
      });
    }
  }
}

// ── Detail field row (module scope — avoids hooks/static-components lint) ──
function DetailField({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {Icon && <Icon size={13} />} {label}
      </p>
      <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.6, background: '#F9FAFB', borderRadius: '8px', padding: '0.75rem 1rem', border: '1px solid var(--border-color)' }}>{value}</p>
    </div>
  );
}

// ── Inline Video Player Modal ──────────────────────────────
const VideoPlayerModal = ({ url, onClose }) => {
  if (!url) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        zIndex: 2000, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '1rem',
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '900px', position: 'relative' }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '-2.5rem', right: 0,
            background: 'rgba(255,255,255,0.15)', border: 'none',
            borderRadius: '8px', padding: '0.4rem 0.8rem',
            cursor: 'pointer', color: '#fff', fontWeight: 600, fontSize: '0.875rem',
            display: 'flex', alignItems: 'center', gap: '0.35rem',
          }}
        >
          <X size={16} /> Close
        </button>
        <video
          src={url}
          controls
          autoPlay
          style={{
            width: '100%', borderRadius: '12px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            maxHeight: '80vh', background: '#000',
          }}
        />
      </div>
    </div>
  );
};

// ── Detail Modal ───────────────────────────────────────────
const DetailModal = ({ sub, onClose }) => {
  const [showVideo, setShowVideo] = useState(false);
  if (!sub) return null;

  const isAbsoluteUrl = (url) => url && (url.startsWith('http://') || url.startsWith('https://'));

  return (
    <>
      {showVideo && <VideoPlayerModal url={sub.videoUrl} onClose={() => setShowVideo(false)} />}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{sub.projectTitle || 'Submission'}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                {[sub.name, sub.grade != null && sub.grade !== '' ? `Class ${sub.grade}` : null, sub.schoolName].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', borderRadius: '8px', padding: '0.5rem', cursor: 'pointer', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: 'rgba(246,172,65,0.08)', borderRadius: '10px', padding: '1rem' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Student ID</p>
                <p style={{ fontWeight: 700, marginTop: '0.25rem' }}>{sub.studentId || '—'}</p>
              </div>
              <div style={{ background: 'rgba(246,172,65,0.08)', borderRadius: '10px', padding: '1rem' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Username</p>
                <p style={{ fontWeight: 700, marginTop: '0.25rem' }}>{sub.username || sub.studentId || '—'}</p>
              </div>
              <div style={{ background: 'rgba(246,172,65,0.08)', borderRadius: '10px', padding: '1rem', gridColumn: '1 / -1' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admission number</p>
                <p style={{ fontWeight: 700, marginTop: '0.25rem', color: sub.admissionNumber ? 'inherit' : 'var(--text-secondary)' }}>{sub.admissionNumber || '—'}</p>
              </div>
              <div style={{ background: 'rgba(246,172,65,0.08)', borderRadius: '10px', padding: '1rem' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>First submitted</p>
                <p style={{ fontWeight: 700, marginTop: '0.25rem' }}>{sub.firstSubmittedAt ? new Date(sub.firstSubmittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</p>
              </div>
              <div style={{ background: 'rgba(246,172,65,0.08)', borderRadius: '10px', padding: '1rem' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last updated</p>
                <p style={{ fontWeight: 700, marginTop: '0.25rem' }}>{sub.updatedAt ? new Date(sub.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : (sub.createdAt ? new Date(sub.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—')}</p>
              </div>
            </div>

            <DetailField icon={Lightbulb}    label="Idea"              value={sub.idea} />
            <DetailField icon={AlertCircle}  label="Problem Statement" value={sub.problemStatement} />
            <DetailField icon={FileText}     label="Solution"          value={sub.solution} />
            <DetailField icon={Cpu}          label="Technology Used"   value={sub.techUsed} />
            <DetailField icon={Zap}          label="Impact"            value={sub.impact} />

            {(sub.videoUrl || sub.documentUrl) && (
              <div>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                  Uploaded Media
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {sub.videoUrl && (
                    isAbsoluteUrl(sub.videoUrl) ? (
                      <button
                        onClick={() => setShowVideo(true)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          background: 'linear-gradient(135deg, #EF5A2C, #F6AC41)',
                          color: '#fff', border: 'none', borderRadius: '10px',
                          padding: '0.75rem 1.25rem', fontSize: '0.9rem',
                          fontWeight: 700, cursor: 'pointer',
                          boxShadow: '0 4px 14px rgba(239,90,44,0.35)',
                          transition: 'transform 0.2s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                      >
                        <Play size={18} fill="white" /> ▶ Play Video
                      </button>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(239,90,44,0.08)', color: 'var(--color-brand-dark-1)', borderRadius: '8px', padding: '0.6rem 1rem', fontSize: '0.875rem', fontWeight: 600 }}>
                        <Video size={16} /> {sub.videoUrl}
                      </div>
                    )
                  )}
                  {sub.documentUrl && (
                    isAbsoluteUrl(sub.documentUrl) ? (
                      <a
                        href={sub.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          background: 'rgba(246,172,65,0.12)', color: 'var(--color-brand-mid-2)',
                          borderRadius: '10px', padding: '0.75rem 1.25rem',
                          fontSize: '0.9rem', fontWeight: 700,
                          border: '1.5px solid rgba(246,172,65,0.3)',
                          textDecoration: 'none',
                        }}
                      >
                        <ExternalLink size={16} /> View Document
                      </a>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(246,172,65,0.1)', color: 'var(--color-brand-mid-2)', borderRadius: '8px', padding: '0.6rem 1rem', fontSize: '0.875rem', fontWeight: 600 }}>
                        <Download size={16} /> {sub.documentUrl}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

/** After roster Excel import: review rows and POST /student-links for selected rows. */
function RosterImportPreviewModal({
  rows,
  selectedIndices,
  onToggleRow,
  onSelectAll,
  linkDays,
  onLinkDaysChange,
  busy,
  err,
  linksByStudentId,
  /** Set after a successful “Generate links” run: `{ count }` */
  generateSuccess,
  onClose,
  onGenerateSelected,
}) {
  const selectAllRef = useRef(null);
  const rowCount = rows?.length ?? 0;
  const allSelected = rowCount > 0 && selectedIndices.size === rowCount;
  const generationCompleted = Boolean(generateSuccess && generateSuccess.count > 0);

  useEffect(() => {
    const el = selectAllRef.current;
    if (el && rowCount > 0) {
      el.indeterminate = selectedIndices.size > 0 && selectedIndices.size < rowCount;
    }
  }, [rowCount, selectedIndices]);

  if (!rows || rowCount === 0) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 20001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="roster-import-preview-title"
        style={{
          background: '#fff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '960px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <div>
            <h2 id="roster-import-preview-title" style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>Roster preview</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {generationCompleted
                ? `${rows.length} row(s) parsed from file.`
                : `${rows.length} row(s) parsed from file. Only checked students will be saved to the database when you generate links.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: '#F3F4F6', border: 'none', borderRadius: '8px', padding: '0.5rem', cursor: 'pointer', display: 'flex' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {generationCompleted ? (
          <div
            style={{
              padding: '2rem 1.5rem 2.25rem',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flex: 1,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '620px',
                background: '#ecfdf5',
                border: '1px solid #86efac',
                borderRadius: '14px',
                padding: '1.5rem 1.25rem',
                textAlign: 'center',
                color: '#166534',
              }}
              role="status"
            >
              <Check size={44} strokeWidth={2.5} style={{ margin: '0 auto 0.75rem', display: 'block' }} aria-hidden />
              <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.35rem' }}>
                {generateSuccess.count} link{generateSuccess.count === 1 ? '' : 's'} generated
              </p>
              <p style={{ fontSize: '0.9rem', color: '#14532d' }}>
                Selected students are saved in the database with their submission links.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0, width: '160px' }}>
                <label className="form-label">Link valid (days)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  className="form-control"
                  value={linkDays}
                  onChange={(e) => onLinkDaysChange(e.target.value)}
                  disabled={busy}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || selectedIndices.size === 0}
                onClick={onGenerateSelected}
              >
                {busy ? 'Generating…' : `Generate links (${selectedIndices.size} selected)`}
              </button>
            </div>
            {err && (
              <p style={{ color: '#dc2626', fontSize: '0.875rem', margin: '0 1.5rem', paddingTop: '0.75rem' }}>{err}</p>
            )}
            <div style={{ overflow: 'auto', padding: '0 1.5rem 1.25rem', flex: 1 }}>
              <table className="table" style={{ width: '100%', fontSize: '0.82rem', marginTop: '0.75rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '2.5rem', textAlign: 'center' }}>
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => onSelectAll(e.target.checked)}
                        disabled={busy}
                        title="Select all"
                        aria-label="Select all rows"
                      />
                    </th>
                    <th>school_name</th>
                    <th>admission_number</th>
                    <th>user_name</th>
                    <th>student_name</th>
                    <th>grade</th>
                    <th>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const sid = row.studentId || row.username;
                    const link = linksByStudentId[sid];
                    return (
                      <tr key={`${sid || 'row'}-${idx}`}>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <input
                            type="checkbox"
                            checked={selectedIndices.has(idx)}
                            onChange={() => onToggleRow(idx)}
                            disabled={busy}
                            aria-label={`Select ${sid || `row ${idx + 1}`}`}
                          />
                        </td>
                        <td>{row.schoolName}</td>
                        <td>{row.admissionNumber || '—'}</td>
                        <td>{row.username}</td>
                        <td>{row.name}</td>
                        <td>{row.grade}</td>
                        <td style={{ maxWidth: '280px', wordBreak: 'break-all' }}>
                          {link?.url ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <a href={link.url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-brand-dark-1)' }}>Open</a>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────
const AdminDashboard = () => {
  const navigate = useNavigate();
  const [rosterRows, setRosterRows]   = useState([]);
  const [rosterAnalytics, setRosterAnalytics] = useState({ linksGenerated: 0, formsFilled: 0, rosterRows: 0 });
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [filterGrade, setFilterGrade] = useState('All');
  const [selectedSub, setSelectedSub] = useState(null);
  const [exporting, setExporting]     = useState(false);

  const [linkDays, setLinkDays]           = useState(7);
  const [linkResults, setLinkResults]     = useState(null);
  const [linkLoading, setLinkLoading]     = useState(false);
  const [linkErr, setLinkErr]             = useState(null);
  const [copiedIdx, setCopiedIdx]         = useState(null);
  const [copiedRosterId, setCopiedRosterId] = useState(null);

  const [rosterImportFile, setRosterImportFile] = useState(null);
  /** Filename shown on the import loading overlay (kept after `file` input is cleared mid-request) */
  const [rosterImportDisplayName, setRosterImportDisplayName] = useState('');
  const [rosterImporting, setRosterImporting]   = useState(false);
  const [rosterImportErr, setRosterImportErr]   = useState(null);
  const [rosterImportOk, setRosterImportOk]     = useState(null);
  const [rosterImportWarnings, setRosterImportWarnings] = useState([]);

  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importPreviewRows, setImportPreviewRows] = useState([]);
  /** Row indices (0-based) selected for link generation in the import preview modal */
  const [importPreviewSelected, setImportPreviewSelected] = useState(() => new Set());
  const [importPreviewDays, setImportPreviewDays] = useState(7);
  const [importPreviewBusy, setImportPreviewBusy] = useState(false);
  const [importPreviewErr, setImportPreviewErr] = useState(null);
  const [importPreviewLinks, setImportPreviewLinks] = useState({});
  /** After successful batch link generation in import modal: `{ count }` */
  const [importPreviewGenerateSuccess, setImportPreviewGenerateSuccess] = useState(null);

  const [createUsername, setCreateUsername]   = useState('');
  const [createName, setCreateName]           = useState('');
  const [createSchool, setCreateSchool]       = useState('');
  const [createGrade, setCreateGrade]       = useState('');
  const [createAdmission, setCreateAdmission] = useState('');

  const saveRosterAndGenerateLink = async () => {
    const u = createUsername.trim();
    const name = createName.trim();
    const school = createSchool.trim();
    const grade = String(createGrade || '').trim();
    if (!u || !name || !school || !grade) {
      setLinkErr('Enter username, student name, school name, and grade.');
      return;
    }
    const g = Number(grade);
    if (!Number.isFinite(g) || g < 1 || g > 9) {
      setLinkErr('Grade must be between 1 and 9.');
      return;
    }
    const days = Math.min(365, Math.max(1, Number(linkDays) || 7));
    setLinkLoading(true);
    setLinkErr(null);
    setLinkResults(null);
    setCopiedIdx(null);
    try {
      const res = await authFetch(`${API_BASE}/api/admin/student-links`, {
        method: 'POST',
        body: JSON.stringify({
          validDays: days,
          publicBaseUrl: publicSpaBaseUrl(),
          students: [{
            username: u,
            name,
            schoolName: school,
            grade: String(Math.floor(g)),
            admissionNumber: createAdmission.trim() || '',
          }],
        }),
      }, navigate);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Could not save student or generate link');
      setLinkResults(json.data || []);
      setCreateUsername('');
      setCreateName('');
      setCreateSchool('');
      setCreateGrade('');
      setCreateAdmission('');
      fetchRoster();
      notifySuccess('Student saved to roster and link is ready to share.');
    } catch (err) {
      if (err.message !== 'Session expired. Please log in again.') {
        setLinkErr(null);
        notifyError(err.message || 'Could not save student or generate link');
      }
    } finally {
      setLinkLoading(false);
    }
  };

  const copyToClipboard = async (text, idx) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      notifyCopyError();
    }
  };

  const closeImportPreview = useCallback(() => {
    setImportPreviewOpen(false);
    setImportPreviewRows([]);
    setImportPreviewSelected(new Set());
    setImportPreviewErr(null);
    setImportPreviewLinks({});
    setImportPreviewBusy(false);
    setImportPreviewGenerateSuccess(null);
  }, []);

  const toggleImportPreviewRow = useCallback((idx) => {
    setImportPreviewSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const setImportPreviewSelectAll = useCallback(
    (checked) => {
      setImportPreviewSelected(() => {
        if (!checked) return new Set();
        return new Set(importPreviewRows.map((_, i) => i));
      });
    },
    [importPreviewRows],
  );

  useEffect(() => {
    if (!importPreviewOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeImportPreview();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [importPreviewOpen, closeImportPreview]);

  useEffect(() => {
    if (!rosterImporting) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [rosterImporting]);

  const generateImportPreviewLinks = async () => {
    if (importPreviewRows.length === 0) return;
    if (importPreviewSelected.size === 0) {
      setImportPreviewErr('Select at least one row to generate links.');
      return;
    }
    const days = Math.min(365, Math.max(1, Number(importPreviewDays) || 7));
    setImportPreviewBusy(true);
    setImportPreviewErr(null);
    setImportPreviewGenerateSuccess(null);
    try {
      const selectedRows = importPreviewRows.filter((_, idx) => importPreviewSelected.has(idx));
      const students = selectedRows.map((r) => ({
        username: String(r.username || r.studentId || '').trim(),
        name: String(r.name || '').trim(),
        schoolName: String(r.schoolName || '').trim(),
        grade: String(r.grade || '').trim(),
        admissionNumber:
          r.admissionNumber != null && String(r.admissionNumber).trim()
            ? String(r.admissionNumber).trim()
            : '',
      }));
      const res = await authFetch(
        `${API_BASE}/api/admin/student-links`,
        {
          method: 'POST',
          body: JSON.stringify({
            validDays: days,
            publicBaseUrl: publicSpaBaseUrl(),
            students,
          }),
        },
        navigate,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Could not generate links');
      const data = Array.isArray(json.data) ? json.data : [];
      const generatedCount = Number(json?.summary?.generatedCount);
      const effectiveCount = Number.isFinite(generatedCount)
        ? generatedCount
        : new Set(data.map((d) => String(d?.studentId || '').trim()).filter(Boolean)).size;
      const requestedRows = Number(json?.summary?.requestedRows);
      const requestedCount = Number.isFinite(requestedRows) ? requestedRows : students.length;
      const notGeneratedCount = Math.max(0, requestedCount - effectiveCount);
      if (notGeneratedCount > 0) {
        const duplicateRowsSkipped = Number(json?.summary?.duplicateRowsSkipped) || 0;
        const persistedFalseCount = Number(json?.summary?.persistedFalseCount) || 0;
        const duplicateIdsSample = Array.isArray(json?.summary?.duplicateStudentIdsSample)
          ? json.summary.duplicateStudentIdsSample
          : [];
        const persistedFalseIdsSample = Array.isArray(json?.summary?.persistedFalseStudentIdsSample)
          ? json.summary.persistedFalseStudentIdsSample
          : [];
        console.warn('[Roster link generation] Some selected rows were not generated.', {
          requestedCount,
          generatedCount: effectiveCount,
          notGeneratedCount,
          duplicateRowsSkipped,
          persistedFalseCount,
          duplicateIdsSample,
          persistedFalseIdsSample,
        });
      }
      setImportPreviewLinks((prev) => {
        const next = { ...prev };
        for (const item of data) {
          if (item && item.studentId) next[item.studentId] = item;
        }
        return next;
      });
      fetchRoster();
      setImportPreviewGenerateSuccess({ count: effectiveCount });
      notifySuccess(
        effectiveCount === 1
          ? 'Link generated and saved to the roster.'
          : `Links generated for ${effectiveCount} students and saved to the roster.`,
      );
    } catch (err) {
      setImportPreviewGenerateSuccess(null);
      if (err.message !== 'Session expired. Please log in again.') {
        setImportPreviewErr(null);
        notifyError(err.message || 'Could not generate links');
      }
    } finally {
      setImportPreviewBusy(false);
    }
  };

  const importRosterExcel = async () => {
    if (!rosterImportFile) {
      setRosterImportErr(
        'Choose an .xlsx or .csv file. Row 1 must start with this exact order: school_name, admission_number, user_name, student_name, grade.',
      );
      return;
    }
    setRosterImporting(true);
    setRosterImportDisplayName(rosterImportFile?.name || '');
    setRosterImportErr(null);
    setRosterImportOk(null);
    setRosterImportWarnings([]);
    try {
      const fd = new FormData();
      fd.append('file', rosterImportFile);
      const res = await authFetch(`${API_BASE}/api/admin/roster/import`, { method: 'POST', body: fd }, navigate);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Import failed');
      const n = json.parsed;
      const list = Array.isArray(json.rows) ? json.rows : [];
      const warnList = Array.isArray(json.warnings) ? json.warnings.filter(Boolean) : [];
      setRosterImportWarnings(warnList);
      setRosterImportFile(null);
      if (list.length > 0) {
        setImportPreviewRows(list);
        if (list.length <= IMPORT_AUTO_SELECT_LIMIT) {
          setImportPreviewSelected(new Set(list.map((_, i) => i)));
        } else {
          setImportPreviewSelected(new Set());
          setRosterImportWarnings((prev) => [
            ...prev,
            `Large import detected (${list.length} rows). Rows are not auto-selected to keep the UI responsive.`,
          ]);
        }
        setImportPreviewDays(String(Math.min(365, Math.max(1, Number(linkDays) || 7))));
        setImportPreviewErr(null);
        setImportPreviewLinks({});
        setImportPreviewGenerateSuccess(null);
        setImportPreviewOpen(true);
        setRosterImportOk(
          typeof n === 'number' ? `Parsed ${n} student row(s). Select rows in the dialog to save and generate links.` : null,
        );
      } else {
        setRosterImportOk(json.message || 'Import complete.');
      }
    } catch (err) {
      if (err.message !== 'Session expired. Please log in again.') {
        setRosterImportErr(err.message);
      }
    } finally {
      setRosterImporting(false);
      setRosterImportDisplayName('');
    }
  };

  const copyRosterUrl = async (text, studentId) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRosterId(studentId);
      setTimeout(() => setCopiedRosterId(null), 2000);
      notifySuccess('Link copied');
    } catch {
      notifyCopyError();
    }
  };

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pub = publicSpaBaseUrl();
      const q = pub ? `?publicBaseUrl=${encodeURIComponent(pub)}` : '';
      const res = await authFetch(`${API_BASE}/api/admin/roster${q}`, {}, navigate);
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const json = await res.json();
      setRosterRows((prevRows) => {
        const nextRows = Array.isArray(json.data) ? json.data : [];
        logBrowserRefreshedSignedLinks(prevRows, nextRows);
        return nextRows;
      });
      if (json.analytics) {
        setRosterAnalytics(json.analytics);
      }
    } catch (err) {
      if (err.message !== 'Session expired. Please log in again.') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!isTokenValid()) {
      clearAuth();
      navigate('/admin/login');
      return;
    }
    fetchRoster();
  }, [navigate, fetchRoster]);

  // Auto-logout when token expires
  useEffect(() => {
    const expStr = localStorage.getItem('adminTokenExp');
    if (!expStr) return;
    const msLeft = parseInt(expStr, 10) - Date.now();
    if (msLeft <= 0) return;
    const timer = setTimeout(() => {
      clearAuth();
      navigate('/admin/login');
    }, msLeft);
    return () => clearTimeout(timer);
  }, [navigate]);

  const handleLogout = () => {
    clearAuth();
    navigate('/admin/login');
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/submissions/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        clearAuth();
        navigate('/admin/login');
        return;
      }
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `technathon_submissions_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      notifySuccess('Export downloaded');
    } catch (err) {
      notifyError(formatNetworkError(err?.message, API_BASE_HINT, 'download the export'));
    } finally {
      setExporting(false);
    }
  };

  const filteredData = filterGrade === 'All'
    ? rosterRows
    : rosterRows.filter((row) => String(row.grade) === filterGrade);

  const grades = [...new Set(rosterRows.map((r) => r.grade).filter(Boolean))];
  const videoCount = rosterRows.filter((r) => r.videoUrl).length;

  const rosterImportLoadingPortal =
    rosterImporting && typeof document !== 'undefined'
      ? createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 20003,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '2rem 2.25rem',
              maxWidth: '440px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            }}
          >
            <RefreshCw
              size={40}
              style={{
                margin: '0 auto 1.25rem',
                display: 'block',
                color: 'var(--color-brand-dark-1)',
                animation: 'spin 1s linear infinite',
              }}
              aria-hidden
            />
            <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', fontWeight: 700 }}>Importing roster…</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55 }}>
              {rosterImportDisplayName ? (
                <>
                  Processing <strong style={{ color: 'var(--text-primary)' }}>{rosterImportDisplayName}</strong>
                  .{' '}
                </>
              ) : null}
              Large files can take a while to upload and save. Please keep this tab open.
            </p>
          </div>
        </div>,
        document.body,
      )
      : null;

  const importPreviewPortal =
    importPreviewOpen
    && importPreviewRows.length > 0
    && typeof document !== 'undefined'
      ? createPortal(
        <RosterImportPreviewModal
          rows={importPreviewRows}
          selectedIndices={importPreviewSelected}
          onToggleRow={toggleImportPreviewRow}
          onSelectAll={setImportPreviewSelectAll}
          linkDays={importPreviewDays}
          onLinkDaysChange={setImportPreviewDays}
          busy={importPreviewBusy}
          err={importPreviewErr}
          linksByStudentId={importPreviewLinks}
          generateSuccess={importPreviewGenerateSuccess}
          onClose={closeImportPreview}
          onGenerateSelected={generateImportPreviewLinks}
        />,
        document.body,
      )
      : null;

  return (
    <div className="animate-fade-in">
      {selectedSub && <DetailModal sub={selectedSub} onClose={() => setSelectedSub(null)} />}
      {rosterImportLoadingPortal}
      {importPreviewPortal}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Dashboard Overview
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            <Shield size={13} style={{ color: '#22c55e' }} />
            Authenticated session
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            id="export-excel-btn"
            onClick={handleExportExcel}
            className="btn btn-primary"
            disabled={exporting || loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <FileSpreadsheet size={16} />
            {exporting ? 'Exporting...' : 'Export to Excel'}
          </button>
          <button
            id="refresh-btn"
            onClick={fetchRoster}
            className="btn btn-secondary"
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            id="logout-btn"
            onClick={handleLogout}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      </div>

      {/* Import roster from Excel */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.15rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileSpreadsheet size={20} style={{ color: 'var(--color-brand-mid-1)' }} />
          Import student roster (.xlsx / .csv)
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.5 }}>
          Row 1 must start with these five titles in this exact order:{' '}
          <code style={{ fontSize: '0.78rem' }}>school_name</code>,{' '}
          <code style={{ fontSize: '0.78rem' }}>admission_number</code>,{' '}
          <code style={{ fontSize: '0.78rem' }}>user_name</code> (unique student ID for links),{' '}
          <code style={{ fontSize: '0.78rem' }}>student_name</code>,{' '}
          <code style={{ fontSize: '0.78rem' }}>grade</code> (1–9). Extra columns after these five are ignored. After upload, a dialog lists imported rows — tick who should get a link, then generate (links are stored in the database).
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 220px' }}>
            <label className="form-label">Excel file</label>
            <input
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/csv"
              className="form-control"
              disabled={rosterImporting}
              onChange={(e) => {
                setRosterImportFile(e.target.files?.[0] || null);
                setRosterImportErr(null);
                setRosterImportOk(null);
              }}
            />
          </div>
          <button type="button" className="btn btn-primary" disabled={rosterImporting} onClick={importRosterExcel}>
            {rosterImporting ? 'Importing…' : 'Upload roster'}
          </button>
        </div>
        {rosterImportErr && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.75rem' }}>{rosterImportErr}</p>}
        {rosterImportOk && <p style={{ color: '#15803d', fontSize: '0.875rem', marginTop: '0.75rem' }}>{rosterImportOk}</p>}
        {rosterImportWarnings.length > 0 && (
          <ul style={{ color: '#92400e', fontSize: '0.82rem', marginTop: '0.5rem', marginBottom: 0, paddingLeft: '1.25rem' }}>
            {rosterImportWarnings.map((w, i) => (
              <li key={`${i}-${String(w).slice(0, 48)}`} style={{ marginTop: '0.25rem' }}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Generate signed form links */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.15rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Link2 size={20} style={{ color: 'var(--color-brand-mid-1)' }} />
          Student form links
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          Enter the student’s full details below, then generate a link. That row is <strong>saved in the database</strong> and appears in the roster table. On the student submission form, <strong>username, name, school, grade, and admission number cannot be changed</strong> (project fields stay editable until rules apply).
          
        </p>

        <div className="form-group" style={{ marginBottom: '1rem', maxWidth: '200px' }}>
          <label className="form-label">Link valid for (days)</label>
          <input
            type="number"
            min={1}
            max={365}
            className="form-control"
            value={linkDays}
            onChange={e => setLinkDays(e.target.value)}
          />
        </div>

        <div style={{ background: 'rgba(246,172,65,0.06)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <p style={{ fontWeight: 700, marginBottom: '0.75rem', fontSize: '0.95rem' }}>Create student &amp; generate link</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: 1.45 }}>
            Username is the unique login key in the signed URL (same as student ID). Admission number is optional.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Username <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                className="form-control"
                placeholder="Unique username"
                value={createUsername}
                onChange={e => { setCreateUsername(e.target.value); setLinkErr(null); }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Student name <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                className="form-control"
                placeholder="Full name"
                value={createName}
                onChange={e => { setCreateName(e.target.value); setLinkErr(null); }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">School name <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                className="form-control"
                placeholder="School"
                value={createSchool}
                onChange={e => { setCreateSchool(e.target.value); setLinkErr(null); }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Grade <span style={{ color: '#dc2626' }}>*</span></label>
              <select className="form-control" value={createGrade} onChange={e => { setCreateGrade(e.target.value); setLinkErr(null); }}>
                <option value="">Select grade</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <option key={n} value={String(n)}>Grade {n}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
              <label className="form-label">Admission number (optional)</label>
              <input
                className="form-control"
                placeholder="Leave blank if not applicable"
                value={createAdmission}
                onChange={e => { setCreateAdmission(e.target.value); setLinkErr(null); }}
              />
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={saveRosterAndGenerateLink}
            disabled={linkLoading}
            style={{ marginTop: '1rem' }}
          >
            {linkLoading ? 'Saving…' : 'Save to roster & generate link'}
          </button>
        </div>

        {linkErr && (
          <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '0.75rem' }}>{linkErr}</p>
        )}
        {linkResults && linkResults.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9rem' }}>Share these URLs (expires at time shown)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '280px', overflowY: 'auto' }}>
              {linkResults.map((row, i) => (
                <div key={row.studentId + row.expiresAt} style={{ background: '#F9FAFB', borderRadius: '8px', padding: '0.75rem 1rem', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{row.studentId}</span>
                    {row.reused && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'rgba(246,172,65,0.2)', color: 'var(--color-brand-dark-1)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>Existing link</span>
                    )}
                    {row.persisted === false && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: '#fee2e2', color: '#991b1b', padding: '0.15rem 0.45rem', borderRadius: '4px' }} title="Import this username in the roster first">Not on roster</span>
                    )}
                  </div>
                  {row.shortLabel && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Short: <code style={{ fontSize: '0.72rem' }}>{row.shortLabel}</code></div>
                  )}
                  <div style={{ fontSize: '0.8rem', wordBreak: 'break-all', marginBottom: '0.35rem' }}>{row.url}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Expires: {new Date(row.expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginTop: '0.5rem', padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    onClick={() => copyToClipboard(row.url, i)}
                  >
                    {copiedIdx === i ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy URL</>}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Analytics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', padding: '1.5rem' }}>
          <div style={{ background: 'rgba(246, 172, 65, 0.1)', padding: '1rem', borderRadius: '12px', marginRight: '1rem' }}>
            <Link2 style={{ color: 'var(--color-brand-dark-1)' }} size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>Links generated</p>
            <h2 style={{ fontSize: '2rem' }}>{rosterAnalytics.linksGenerated}</h2>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Unique student IDs with a link</p>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', padding: '1.5rem' }}>
          <div style={{ background: 'rgba(34, 197, 94, 0.12)', padding: '1rem', borderRadius: '12px', marginRight: '1rem' }}>
            <Check style={{ color: '#15803d' }} size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>Forms filled</p>
            <h2 style={{ fontSize: '2rem' }}>{rosterAnalytics.formsFilled}</h2>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Finalized at least once</p>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', padding: '1.5rem' }}>
          <div style={{ background: 'rgba(246, 172, 65, 0.1)', padding: '1rem', borderRadius: '12px', marginRight: '1rem' }}>
            <BarChart3 style={{ color: 'var(--color-brand-dark-1)' }} size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>Roster rows</p>
            <h2 style={{ fontSize: '2rem' }}>{rosterAnalytics.rosterRows}</h2>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Students in table</p>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', padding: '1.5rem' }}>
          <div style={{ background: 'rgba(246, 172, 65, 0.1)', padding: '1rem', borderRadius: '12px', marginRight: '1rem' }}>
            <Users style={{ color: 'var(--color-brand-dark-1)' }} size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>Active grades</p>
            <h2 style={{ fontSize: '2rem' }}>{grades.length}</h2>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', padding: '1.5rem' }}>
          <div style={{ background: 'rgba(246, 172, 65, 0.1)', padding: '1rem', borderRadius: '12px', marginRight: '1rem' }}>
            <Video style={{ color: 'var(--color-brand-dark-1)' }} size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>Videos uploaded</p>
            <h2 style={{ fontSize: '2rem' }}>{videoCount}</h2>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 style={{ fontSize: '1.25rem' }}>Submission Roster</h3>
          <select
            id="grade-filter"
            className="form-control"
            style={{ width: 'auto', minWidth: '150px' }}
            value={filterGrade}
            onChange={e => setFilterGrade(e.target.value)}
          >
            <option value="All">All Grades</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <option key={num} value={num.toString()}>Grade {num}</option>
            ))}
          </select>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Username</th>
                <th>Admission</th>
                <th>Name</th>
                <th>Grade</th>
                <th>School</th>
                <th>Project Title</th>
                <th>Share link</th>
                <th>Status</th>
                <th>Media</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="11" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 0.75rem' }} />
                  Loading roster...
                </td></tr>
              ) : error ? (
                <tr><td colSpan="11" style={{ textAlign: 'center', padding: '2rem', color: '#ef4444' }}>
                  <AlertCircle size={20} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                  {error}
                </td></tr>
              ) : filteredData.length > 0 ? filteredData.map((row, idx) => (
                <tr key={`${row.studentId || row.username || 'roster-row'}-${idx}`}>
                  <td><span className="badge">{row.studentId || '—'}</span></td>
                  <td style={{ fontSize: '0.85rem' }}>{row.username || row.studentId || '—'}</td>
                  <td style={{ fontSize: '0.85rem', color: row.admissionNumber ? 'inherit' : 'var(--text-secondary)' }}>{row.admissionNumber || '—'}</td>
                  <td style={{ fontWeight: 500 }}>{row.name || '—'}</td>
                  <td>{row.grade ? `Class ${row.grade}` : '—'}</td>
                  <td>{row.schoolName || '—'}</td>
                  <td>{row.projectTitle || '—'}</td>
                  <td>
                    {row.shareUrl ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem', maxWidth: '200px' }}>
                        <code style={{ fontSize: '0.7rem', wordBreak: 'break-all', lineHeight: 1.35, color: 'var(--text-secondary)' }} title={row.shareUrl}>
                          {row.shortLabel || row.submitPath}
                        </code>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                          onClick={() => copyRosterUrl(row.shareUrl, row.studentId)}
                        >
                          {copiedRosterId === row.studentId ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                        </button>
                        {!row.linkActive && row.hasLink && (
                          <span style={{ fontSize: '0.65rem', color: '#b45309' }}>Link expired</span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {row.formFilled ? (
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: '#dcfce7', color: '#166534', padding: '0.25rem 0.5rem', borderRadius: '6px' }}>Filled</span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: '#f3f4f6', color: '#6b7280', padding: '0.25rem 0.5rem', borderRadius: '6px' }}>Not filled</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {row.videoUrl && (
                        <span title="Has Video" style={{ background: 'linear-gradient(135deg,#EF5A2C,#F6AC41)', borderRadius: '6px', padding: '3px 6px', display: 'flex', alignItems: 'center' }}>
                          <Play size={14} color="#fff" fill="#fff" />
                        </span>
                      )}
                      {row.documentUrl && (
                        <span title="Has Document" style={{ color: 'var(--color-brand-mid-1)' }}>
                          <Download size={16} />
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                      onClick={() => setSelectedSub(row)}
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="11" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                  No roster rows for this filter. Import a roster, generate links, or wait for submissions.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
