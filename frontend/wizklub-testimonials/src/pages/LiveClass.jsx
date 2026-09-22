import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import {
  ArrowRight, CheckCircle2, Clock3, KeyRound, MonitorPlay, Play, Square, UserMinus, UserCheck, Users, X,
} from 'lucide-react'
import { api } from '../api/client'
import AppShell from '../components/layout/AppShell'
import LoadingScreen from '../components/ui/LoadingScreen'
import PageHeader from '../components/ui/PageHeader'
import { useNavigate } from '../router'
import '../styles/app.css'
import './pages.css'
import './live-class.css'

/*
 * Start class — the teacher half of lab attendance.
 *
 * The teacher taps Start, a 4-digit code appears (big enough for the back row), students join
 * with that code plus their own PIN, and the roster fills in live. "End class" is the commit
 * point: everyone still waiting is recorded absent and attendance locks.
 *
 * Attendance here is a by-product of how children log in — no register, no paperwork.
 */

const fmtTime = (ts) =>
  ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''

function firstName(fullName) {
  return String(fullName || '').split(' ')[0]
}

function StatusChip({ status }) {
  if (status === 'joined') return <span className="lc-chip lc-chip--in"><CheckCircle2 size={13} aria-hidden /> In class</span>
  if (status === 'absent') return <span className="lc-chip lc-chip--out"><UserMinus size={13} aria-hidden /> Absent</span>
  return <span className="lc-chip lc-chip--wait"><Clock3 size={13} aria-hidden /> Not yet</span>
}

function CodeTiles({ code, size = 'md' }) {
  return (
    <div className={`lc-code lc-code--${size}`} aria-label={`Class code ${String(code).split('').join(' ')}`}>
      {String(code).split('').map((digit, index) => (
        <span key={index} className="lc-code__tile" aria-hidden>{digit}</span>
      ))}
    </div>
  )
}

export default function LiveClass({ batchId, schoolId = '' }) {
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [board, setBoard] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [batchInfo, setBatchInfo] = useState(null)

  // `now` is kept in state (refreshed with every poll) so nothing impure runs during render.
  const [now, setNow] = useState(0)

  const apply = useCallback((result) => {
    setSession(result && !result.forbidden ? result : null)
    setNow(Date.now())
    setLoaded(true)
  }, [])

  const refresh = useCallback(async () => {
    apply(await api.getClassSession(batchId))
  }, [apply, batchId])

  useEffect(() => {
    let alive = true
    api.getClassSession(batchId).then((result) => {
      if (alive) apply(result)
    })
    return () => { alive = false }
  }, [apply, batchId])

  // Before a class starts there is no session yet, so name the batch from the roster.
  useEffect(() => {
    if (session) return
    let alive = true
    api.getStudents(batchId, 'all', schoolId).then((result) => {
      if (!alive || !result || result.forbidden) return
      setBatchInfo({ name: result.batch.name, count: result.students.length })
    })
    return () => { alive = false }
  }, [session, batchId, schoolId])

  // While a class is running the roster fills in on its own, so poll.
  useEffect(() => {
    if (session?.status !== 'live') return undefined
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [session?.status, refresh])

  useEffect(() => {
    if (!board) return undefined
    const onKey = (event) => { if (event.key === 'Escape') setBoard(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [board])

  const minutesLeft = useMemo(() => {
    if (session?.status !== 'live' || !now) return null
    return Math.max(0, Math.round((session.ends_at - now) / 60000))
  }, [session, now])

  const start = async () => {
    setBusy(true)
    const result = await api.startClass(batchId)
    setBusy(false)
    if (!result || result.forbidden) return toast.error('Could not start the class.')
    setSession(result)
    toast.success('Class started — write the code on the board')
  }

  const mark = async (studentId, status) => {
    const result = await api.markAttendance(batchId, studentId, status)
    if (result) setSession(result)
  }

  const resetPin = async (student) => {
    const result = await api.resetStudentPin(batchId, student.id)
    if (!result) return toast.error('Could not reset the PIN.')
    setSession(result)
    toast.success(`${firstName(student.full_name)} can set a new PIN on the next try`)
  }

  const end = async () => {
    setConfirmEnd(false)
    setBusy(true)
    const result = await api.endClass(batchId)
    setBusy(false)
    if (!result) return toast.error('Could not end the class.')
    setSession(result)
    setBoard(false)
    toast.success('Attendance saved')
  }

  const backPath = schoolId ? `/schools/${schoolId}/batches` : '/schools'

  if (!loaded) {
    return (
      <AppShell topBarVariant="back" activeTab="schools" className="page-live-class">
        <LoadingScreen message="Loading class…" />
      </AppShell>
    )
  }

  const live = session?.status === 'live'
  const ended = session?.status === 'ended'
  const counts = session?.counts ?? { total: 0, joined: 0, waiting: 0, absent: 0 }

  return (
    <AppShell topBarVariant="back" activeTab="schools" className="page-live-class">
      <div className="page animate-in">
        <PageHeader
          eyebrow={session?.batch_name || batchInfo?.name || 'Today’s class'}
          title={live ? 'Class is running' : ended ? 'Class finished' : 'Start class'}
          subtitle={
            live
              ? 'Students join with the code below and their own PIN. Attendance saves when you end the class.'
              : ended
                ? 'Attendance is saved. You can still open the batch to review uploads.'
                : 'Start the class to get a code for the board. Students who join are marked present automatically.'
          }
        />

        {/* --- not started --- */}
        {!session && (
          <section className="lc-start">
            <span className="lc-start__art" aria-hidden><Play size={30} strokeWidth={2} /></span>
            <h2 className="lc-start__title">Ready when you are</h2>
            <p className="lc-start__text">
              You’ll get a 4-digit code to write on the board. It works only for this batch, only for this period,
              and it dies the moment you end the class.
            </p>
            {batchInfo && (
              <p className="lc-start__roster">
                <Users size={15} aria-hidden /> {batchInfo.count} students on this roster
              </p>
            )}
            <button type="button" className="btn-primary lc-start__btn" onClick={start} disabled={busy}>
              {busy ? 'Starting…' : 'Start class'} <ArrowRight size={18} aria-hidden />
            </button>
          </section>
        )}

        {/* --- live --- */}
        {live && (
          <section className="lc-live" aria-label="Class code and attendance">
            <div className="lc-codecard">
              <div className="lc-codecard__body">
                <p className="lc-codecard__label">Class code</p>
                <CodeTiles code={session.code} />
                <p className="lc-codecard__meta">
                  {session.pin_style === 'pictures'
                    ? 'This batch uses picture PINs'
                    : 'This batch uses 4-number PINs'}
                  {minutesLeft !== null && ` · ${minutesLeft} min left`}
                </p>
              </div>
              <button type="button" className="lc-board-btn" onClick={() => setBoard(true)}>
                <MonitorPlay size={18} aria-hidden /> Show on the board
              </button>
            </div>

            <div className="lc-counts">
              <span className="lc-count lc-count--in"><b>{counts.joined}</b> in class</span>
              <span className="lc-count lc-count--wait"><b>{counts.waiting}</b> not yet</span>
              <span className="lc-count lc-count--out"><b>{counts.absent}</b> absent</span>
              <span className="lc-count"><Users size={14} aria-hidden /> {counts.total} on the roster</span>
            </div>
          </section>
        )}

        {/* --- ended summary --- */}
        {ended && (
          <section className="lc-summary">
            <p className="lc-summary__kicker">Attendance saved · {fmtTime(session.ended_at)}</p>
            <h2 className="lc-summary__title">
              {counts.joined} of {counts.total} students attended
            </h2>
            <p className="lc-summary__text">
              {counts.absent === 0
                ? 'Everyone was here.'
                : `${counts.absent} marked absent. Tell your coordinator if that looks wrong — it can still be corrected today.`}
            </p>
            <button type="button" className="btn-primary lc-summary__btn" onClick={() => navigate(backPath)}>
              Back to batches <ArrowRight size={18} aria-hidden />
            </button>
          </section>
        )}

        {/* --- roster --- */}
        {session && (
          <section className="dash-section" aria-labelledby="lc-roster">
            <div className="section-header">
              <h2 id="lc-roster" className="section-title">Students</h2>
              {live && <span className="lc-live-dot">Live</span>}
            </div>

            <div className="lc-roster">
              {session.roster.map((student) => (
                <div key={student.id} className={`lc-student lc-student--${student.status}`}>
                  <span className="lc-student__face" aria-hidden>{firstName(student.full_name)[0]}</span>
                  <div className="lc-student__body">
                    <p className="lc-student__name">{student.full_name}</p>
                    <p className="lc-student__meta">
                      {student.roll_number}
                      {student.status === 'joined' && student.joined_at ? ` · joined ${fmtTime(student.joined_at)}` : ''}
                    </p>
                  </div>
                  <StatusChip status={student.status} />
                  {live && (
                    <div className="lc-student__acts">
                      {student.status !== 'joined' && (
                        <button type="button" className="lc-act" onClick={() => mark(student.id, 'joined')}>
                          <UserCheck size={15} aria-hidden /> Present
                        </button>
                      )}
                      {student.status !== 'absent' && (
                        <button type="button" className="lc-act" onClick={() => mark(student.id, 'absent')}>
                          <UserMinus size={15} aria-hidden /> Absent
                        </button>
                      )}
                      <button type="button" className="lc-act" onClick={() => resetPin(student)}>
                        <KeyRound size={15} aria-hidden /> Reset PIN
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {live && (
          <div className="lc-endbar">
            {confirmEnd ? (
              <>
                <p className="lc-endbar__text lc-endbar__text--warn">
                  {counts.waiting > 0
                    ? `${counts.waiting} student${counts.waiting === 1 ? '' : 's'} never joined and will be marked absent.`
                    : 'Everyone is in. Attendance will be saved as it looks now.'}
                </p>
                <span className="lc-endbar__acts">
                  <button type="button" className="lc-act" onClick={() => setConfirmEnd(false)}>Keep it running</button>
                  <button type="button" className="lc-end" onClick={end} disabled={busy}>
                    <Square size={16} aria-hidden /> {busy ? 'Saving…' : 'Yes, end class'}
                  </button>
                </span>
              </>
            ) : (
              <>
                <p className="lc-endbar__text">Attendance is not saved until you end the class.</p>
                <button type="button" className="lc-end" onClick={() => setConfirmEnd(true)} disabled={busy}>
                  <Square size={16} aria-hidden /> End class &amp; save attendance
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* --- projector view --- */}
      {board && live && (
        <div className="lc-board" role="dialog" aria-modal="true" aria-label="Class code for the board">
          <button type="button" className="lc-board__close" onClick={() => setBoard(false)} aria-label="Close">
            <X size={22} aria-hidden />
          </button>
          <p className="lc-board__kicker">{session.batch_name}</p>
          <p className="lc-board__label">Type this code to join</p>
          <CodeTiles code={session.code} size="xl" />
          <p className="lc-board__count">{counts.joined} of {counts.total} students are in</p>
          <p className="lc-board__hint">Press Esc to close</p>
        </div>
      )}
    </AppShell>
  )
}
