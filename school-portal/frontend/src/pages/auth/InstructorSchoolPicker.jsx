import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, GraduationCap, Loader2 } from 'lucide-react';
import api from '@inventory/utils/api';
import Badge from '@inventory/components/ui/Badge';
import { ROUTES } from '@school-portal/routes/constants';
import { AuthContext } from '@inventory/context/AuthContext';
import BrandLogo from '@inventory/components/brand/BrandLogo';
import { formatSchoolDisplayName } from '@inventory/utils/schoolName';

function readInstructorSession() {
  try {
    const raw = sessionStorage.getItem('instructorSession');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const InstructorSchoolPicker = () => {
  const navigate = useNavigate();
  const { completeInstructorSchoolSelection } = useContext(AuthContext);
  const [session] = useState(() => readInstructorSession());
  const [schools, setSchools] = useState([]);
  const [instructorName, setInstructorName] = useState(session?.instructorName || '');
  const [loading, setLoading] = useState(true);
  const [selectingCode, setSelectingCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session?.instructorToken) {
      navigate(ROUTES.login.school, { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/auth/instructor/schools', {
          headers: { 'X-Instructor-Token': session.instructorToken },
        });
        if (cancelled) return;
        setSchools(res.data.schools || []);
        setInstructorName(res.data.instructorName || session.instructorName || '');
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Failed to load schools');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [session, navigate]);

  const handleSelect = async (school) => {
    if (!school.hasInventory) return;
    setSelectingCode(school.schoolCode);
    setError('');
    try {
      await completeInstructorSchoolSelection(
        school.srCode || school.wizklubSchoolId || school.schoolCode,
        session.instructorToken,
      );
      navigate(ROUTES.school.root);
    } catch (err) {
      setError(err.response?.data?.message || err || 'Could not open this school');
    } finally {
      setSelectingCode('');
    }
  };

  return (
    <div className="min-h-screen app-shell-bg flex relative overflow-hidden">
      <div className="glass-orb-orange w-72 h-72 top-16 left-8 animate-float" aria-hidden />
      <div className="glass-orb-amber w-96 h-96 bottom-16 right-8 animate-float" style={{ animationDelay: '1.5s' }} aria-hidden />

      <div className="flex-1 flex flex-col py-10 px-4 sm:px-8 relative z-10 max-w-3xl mx-auto w-full">
        <div className="flex justify-center mb-5">
          <BrandLogo className="h-11 w-auto max-w-[200px]" />
        </div>

        <Link
          to={ROUTES.login.school}
          className="inline-flex items-center gap-2 glass-chip text-white/75 hover:text-white text-sm font-medium mb-6 transition-colors normal-case tracking-normal w-fit"
          onClick={() => sessionStorage.removeItem('instructorSession')}
        >
          <ArrowLeft size={16} />
          Back to login
        </Link>

        <div className="glass-login-card">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-orange-light flex items-center justify-center text-white shadow-glow-orange">
              <GraduationCap size={28} strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-primary">Instructor access</p>
              <h1 className="text-2xl font-extrabold text-brand-deep">Select a school</h1>
              {instructorName && (
                <p className="text-sm text-slate-500 mt-0.5">Signed in as {instructorName}</p>
              )}
            </div>
          </div>

          <p className="text-sm text-slate-600 mb-6">
            Choose a school to view its dispatch and inventory data. Only schools registered in this system can be opened.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-error-50/80 text-error-700 text-sm font-medium rounded-xl border border-error-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <Loader2 className="animate-spin text-brand-primary" size={32} />
              <p className="text-sm font-medium">Loading your schools…</p>
            </div>
          ) : schools.length === 0 ? (
            <p className="text-center py-12 text-slate-500">No schools linked to this instructor account.</p>
          ) : (
            <div className="space-y-3">
              {schools.map((school) => {
                const isSelecting = selectingCode === school.schoolCode;
                const disabled = !school.hasInventory || Boolean(selectingCode);

                return (
                  <button
                    key={school.schoolId}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSelect(school)}
                    className={`w-full text-left rounded-xl border p-4 transition-all ${
                      school.hasInventory
                        ? 'border-slate-200 bg-white hover:border-brand-primary/40 hover:shadow-md'
                        : 'border-slate-100 bg-slate-50 opacity-75 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                          <Building2 size={22} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">
                            {formatSchoolDisplayName(school.name)}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs">
                            {school.srCode && (
                              <span className="inline-flex items-center gap-1 font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                <span className="font-semibold text-slate-500">SR Code:</span>
                                <span className="font-bold text-slate-900">{school.srCode}</span>
                              </span>
                            )}
                            {(school.wizklubSchoolId || school.schoolId) && (
                              <span className="inline-flex items-center gap-1 font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                <span className="font-semibold text-slate-500">School ID:</span>
                                <span className="font-bold text-slate-900">{school.wizklubSchoolId || school.schoolId}</span>
                              </span>
                            )}
                          </div>
                          {!school.hasInventory && (
                            <p className="text-xs text-amber-700 mt-1.5 font-medium">
                              Not registered in inventory — contact admin to add this school.
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-2">
                        {school.hasInventory ? (
                          <Badge type="success">Inventory available</Badge>
                        ) : (
                          <Badge type="pending">Not in system</Badge>
                        )}
                        {school.hasInventory && (
                          <span className="text-xs font-semibold text-brand-primary">
                            {isSelecting ? 'Opening…' : 'View inventory →'}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstructorSchoolPicker;
