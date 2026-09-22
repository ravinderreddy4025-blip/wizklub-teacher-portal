import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, Building2, GraduationCap, Loader2 } from 'lucide-react';
import api from '@inventory/utils/api';
import Badge from '@inventory/components/ui/Badge';
import { ROUTES } from '@school-portal/routes/constants';
import { AuthContext } from '@inventory/context/AuthContext';
import AuthLayout from '@inventory/components/auth/AuthLayout';
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
    <AuthLayout tagline="Kit Inventory" sub="Pick the school whose kits you want to see." wide>
      <Link
        to={ROUTES.login.school}
        className="inv-auth-back"
        onClick={() => sessionStorage.removeItem('instructorSession')}
      >
        <ArrowLeft size={18} aria-hidden />
        Back to login
      </Link>

      <h1 className="inv-auth-title">Select a school</h1>
      <p className="inv-auth-subtitle">
        {instructorName ? `Signed in as ${instructorName}` : 'Instructor access'}
      </p>
      <p className="mt-2 text-center text-sm text-wk-body">
        Choose a school to view its dispatch and inventory data. Only schools registered in this system can be opened.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {error && (
          <div className="inv-auth-alert" role="alert">
            <AlertCircle size={18} aria-hidden />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-wk-body" role="status">
            <Loader2 className="animate-spin text-wk-orange-text" size={32} aria-hidden />
            <p className="text-sm font-medium">Loading your schools…</p>
          </div>
        ) : schools.length === 0 ? (
          <div className="inv-empty">
            <GraduationCap size={24} aria-hidden />
            <p className="inv-empty__title">No schools linked yet</p>
            <p className="inv-empty__text">No schools linked to this instructor account.</p>
          </div>
        ) : (
          schools.map((school) => {
            const isSelecting = selectingCode === school.schoolCode;
            const disabled = !school.hasInventory || Boolean(selectingCode);

            return (
              <button
                key={school.schoolId}
                type="button"
                disabled={disabled}
                onClick={() => handleSelect(school)}
                className="inv-choice group"
              >
                <span className={`inv-choice__art ${school.hasInventory ? 'bg-wk-peach text-wk-orange-text' : 'bg-white text-wk-muted'}`}>
                  <Building2 size={24} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="inv-choice__name truncate">{formatSchoolDisplayName(school.name)}</span>
                  <span className="inv-choice__meta flex flex-wrap gap-x-3">
                    {school.srCode && <span>SR code: <span className="font-mono text-wk-ink">{school.srCode}</span></span>}
                    {(school.wizklubSchoolId || school.schoolId) && (
                      <span>School ID: <span className="font-mono text-wk-ink">{school.wizklubSchoolId || school.schoolId}</span></span>
                    )}
                  </span>
                  {!school.hasInventory && (
                    <span className="mt-1 text-[13px] font-medium text-warning-700">
                      Not registered in inventory — contact admin to add this school.
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  {school.hasInventory ? (
                    <Badge type="success">Inventory available</Badge>
                  ) : (
                    <Badge type="warning">Not in system</Badge>
                  )}
                  {school.hasInventory && (
                    <span className="inv-choice__go">
                      {isSelecting ? 'Opening…' : 'View inventory'}
                      {!isSelecting && <ArrowRight size={16} aria-hidden />}
                    </span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </AuthLayout>
  );
};

export default InstructorSchoolPicker;
