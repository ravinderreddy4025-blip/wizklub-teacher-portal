import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import api from '../utils/api';
import toast from '../utils/toast';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import SkeletonLoader from '../components/ui/SkeletonLoader';
import AuditReportDetails from '../components/AuditReportDetails';
import PageHeader from '../components/layout/PageHeader';
import { AmApprovalSection, AmApprovalTile, ReceiptIssueTable, ReplacementRequestTable, AmAuditApprovalList } from '../components/am/AmApprovalSections';
import { Scale, PackageX, ShieldAlert, ArrowLeft, ArrowRight, PackageMinus, MapPin, Search, GraduationCap, RefreshCw } from 'lucide-react';
import { ROUTES } from '../utils/routes';
import { formatSchoolDisplayName } from '../utils/schoolName';
import { formatSchoolIdentityPrefix } from '../utils/componentId';
import { DispatchIdCell, KitDetailsCell, QuantityCell } from '../components/shared/DispatchRedispatchCells';
import DispatchTrackingModal from '../components/shared/DispatchTrackingModal';
import DispatchProofPhoto from '../components/shared/DispatchProofPhoto';
import AmOperationsBoard from '../components/am/AmOperationsBoard';
import downloadPdfBlob, { downloadDispatchInvoicePdf } from '../utils/downloadPdfBlob';
import { useAmApprovalCounts } from '../context/AmApprovalCountsContext';
import { countAuditLines } from '../utils/auditApprovals';
import AmRegionPicker from '../components/am/AmRegionPicker';

const EMPTY_DATA = {
  division: null,
  divisions: [],
  schools: [],
  audits: [],
  dispatches: [],
  requests: [],
  receiptIssues: [],
};

const AM_DIVISION_STORAGE_KEY = 'amSelectedDivisionId';

function dispatchDate(dispatch) {
  const raw = dispatch.dispatchedAt || dispatch.createdAt;
  return raw ? new Date(raw) : null;
}

function matchesPeriod(date, period, monthValue, yearValue) {
  if (!date) return false;
  if (period === 'monthly') {
    if (!monthValue) return false;
    const [year, month] = monthValue.split('-').map(Number);
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  }
  if (period === 'yearly') {
    if (!yearValue) return false;
    return date.getFullYear() === Number(yearValue);
  }
  return true;
}

function defaultMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const APPROVAL_CATEGORY_PATHS = {
  missing: ROUTES.am.approvalsMissing,
  lost: ROUTES.am.approvalsLost,
  damaged: ROUTES.am.approvalsDamaged,
  mismatch: ROUTES.am.approvalsMismatch,
};

function formatAuditMonthLabel(month) {
  const [year, m] = (month || '').split('-').map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function groupAuditsByMonth(audits) {
  const grouped = {};
  audits.forEach((audit) => {
    if (!grouped[audit.month]) grouped[audit.month] = [];
    grouped[audit.month].push(audit);
  });
  return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
}

const AMDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeView = useMemo(() => {
    const path = location.pathname;
    if (path.includes('/approvals')) return 'approvals';
    if (path.includes('/dispatches')) return 'dispatches';
    if (path.includes('/audits')) return 'audits';
    if (path === ROUTES.am.schools || path === `${ROUTES.am.schools}/`) return 'schools';
    return 'invalid';
  }, [location.pathname]);

  const approvalCategory = useMemo(() => {
    const path = location.pathname;
    if (path === ROUTES.am.approvalsMissing || path.endsWith('/approvals/missing')) return 'missing';
    if (path === ROUTES.am.approvalsLost || path.endsWith('/approvals/lost')) return 'lost';
    if (path === ROUTES.am.approvalsDamaged || path.endsWith('/approvals/damaged')) return 'damaged';
    if (path === ROUTES.am.approvalsMismatch || path.endsWith('/approvals/mismatch')) return 'mismatch';
    if (path.endsWith('/approvals/other')) return 'damaged';
    return null;
  }, [location.pathname]);

  const isApprovalGrid = activeView === 'approvals' && approvalCategory === null;
  const isApprovalDetail = activeView === 'approvals' && approvalCategory !== null;

  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [selectedDispatchSchool, setSelectedDispatchSchool] = useState(null);
  const [trackingDispatch, setTrackingDispatch] = useState(null);
  const [dispatchPeriod, setDispatchPeriod] = useState('monthly');
  const [dispatchMonth, setDispatchMonth] = useState('');
  const [dispatchYear, setDispatchYear] = useState(String(new Date().getFullYear()));
  const [auditSchoolFilter, setAuditSchoolFilter] = useState('all');
  const [auditMonthFilter, setAuditMonthFilter] = useState('all');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [selectedDivisionId, setSelectedDivisionId] = useState(
    () => sessionStorage.getItem(AM_DIVISION_STORAGE_KEY) || '',
  );
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [opsMonth, setOpsMonth] = useState(defaultMonthValue);
  const [opsSummary, setOpsSummary] = useState(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const { setCounts: setAmApprovalCounts } = useAmApprovalCounts();

  const persistDivisionId = (id) => {
    setSelectedDivisionId(id);
    if (id) sessionStorage.setItem(AM_DIVISION_STORAGE_KEY, id);
    else sessionStorage.removeItem(AM_DIVISION_STORAGE_KEY);
  };

  const fetchData = async (divisionId = selectedDivisionId) => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await api.get('/am/dashboard', {
        params: divisionId ? { divisionId } : {},
      });
      setData({
        division: res.data.division || null,
        divisions: res.data.divisions || [],
        schools: res.data.schools || [],
        audits: res.data.audits || [],
        dispatches: res.data.dispatches || [],
        requests: res.data.requests || [],
        receiptIssues: res.data.receiptIssues || [],
      });
      if (res.data.needsSelection) {
        setShowRegionPicker(true);
        return;
      }
      if (res.data.division?._id) {
        persistDivisionId(String(res.data.division._id));
        setShowRegionPicker(false);
      }
    } catch (err) {
      console.error(err);
      const message = err.response?.data?.message || 'Failed to load division data';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectRegion = (divisionId) => {
    persistDivisionId(String(divisionId));
    setShowRegionPicker(false);
    setSelectedDispatchSchool(null);
    setSelectedSchool(null);
    fetchData(String(divisionId));
  };

  useEffect(() => {
    if (activeView !== 'dispatches') {
      setSelectedDispatchSchool(null);
    }
  }, [activeView]);

  const handleSelectDispatchSchool = (school) => {
    setSelectedDispatchSchool(school);
    setDispatchPeriod('monthly');
    const month = defaultMonthValue();
    setDispatchMonth(month);
    setOpsMonth(month);
    setDispatchYear(String(new Date().getFullYear()));
  };

  useEffect(() => {
    if (dispatchPeriod === 'monthly' && dispatchMonth) {
      setOpsMonth(dispatchMonth);
    }
  }, [dispatchMonth, dispatchPeriod]);

  useEffect(() => {
    const divisionId = data.division?._id || selectedDivisionId;
    if (!divisionId) {
      setOpsSummary(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        setOpsLoading(true);
        const res = await api.get('/am/reports/monthly', {
          params: {
            month: opsMonth,
            divisionId,
            ...(selectedDispatchSchool?._id ? { schoolId: selectedDispatchSchool._id } : {}),
          },
        });
        if (!cancelled) setOpsSummary(res.data || null);
      } catch (err) {
        console.error(err);
        if (!cancelled) setOpsSummary(null);
      } finally {
        if (!cancelled) setOpsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opsMonth, selectedDispatchSchool?._id, data.division?._id, selectedDivisionId]);

  const handleDownloadOpsPdf = async () => {
    if (!selectedDispatchSchool?._id) return;
    try {
      setDownloadingPdf(true);
      const res = await api.get(`/am/reports/school/${selectedDispatchSchool._id}/pdf`, {
        params: { month: opsMonth },
        responseType: 'blob',
      });
      const safeName = (selectedDispatchSchool.name || 'school').replace(/[^\w-]+/g, '_').slice(0, 40);
      downloadPdfBlob(res.data, `wizklub-report-${safeName}-${opsMonth}.pdf`);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error('Failed to download school report PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleAction = async (id, action) => {
    const result = await toast.approvalNotes({ action, kind: 'replacement' });
    if (!result.confirmed) return;

    try {
      await api.put(`/am/replacement/${id}/${action}`, { amNotes: result.notes });
      if (action === 'approve') {
        toast.success('Approved — sent to Admin for review. Product will be dispatched after admin authorization.');
      } else {
        toast.success('Replacement request rejected.');
      }
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action} request`);
    }
  };

  const handleReceiptIssueAction = async (id, action) => {
    const result = await toast.approvalNotes({ action, kind: 'receipt' });
    if (!result.confirmed) return;

    try {
      await api.put(`/am/receipt-issue/${id}/${action}`, { amNotes: result.notes });
      if (action === 'approve') {
        toast.success('Approved — sent to Admin for review. Replacement will be dispatched after admin authorization.');
      } else {
        toast.success('Receipt issue rejected.');
      }
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action} issue`);
    }
  };

  const handleAuditAction = async (auditId, action, lineType = null) => {
    const result = await toast.approvalNotes({ action, kind: 'receipt' });
    if (!result.confirmed) return;
    try {
      await api.put(`/am/audit/${auditId}/${action}`, {
        amNotes: result.notes,
        ...(lineType ? { lineType } : {}),
      });
      const label = lineType === 'lost' ? 'Lost kits' : lineType === 'damaged' ? 'Damaged kits' : 'Audit';
      toast.success(
        action === 'approve'
          ? `${label} approved.${lineType ? ' The other category is unchanged.' : ' Sent to admin.'}`
          : `${label} rejected.`,
      );
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action} audit`);
    }
  };

  const handleOpenAuditForSchool = (school) => {
    setSelectedSchool(school);
    setIsAuditModalOpen(true);
  };

  const filteredDispatches = useMemo(() => {
    if (!selectedDispatchSchool) return [];
    const schoolId = selectedDispatchSchool._id;
    return data.dispatches.filter((d) => {
      const dSchoolId = d.school?._id || d.school;
      if (String(dSchoolId) !== String(schoolId)) return false;
      return matchesPeriod(dispatchDate(d), dispatchPeriod, dispatchMonth, dispatchYear);
    });
  }, [data.dispatches, selectedDispatchSchool, dispatchPeriod, dispatchMonth, dispatchYear]);

  const dispatchCountBySchool = useMemo(() => {
    const counts = {};
    data.dispatches.forEach((d) => {
      const schoolId = d.school?._id || d.school;
      if (!schoolId) return;
      counts[schoolId] = (counts[schoolId] || 0) + 1;
    });
    return counts;
  }, [data.dispatches]);

  const filteredAudits = useMemo(() => {
    if (auditMonthFilter === 'all') return data.audits;
    return data.audits.filter((audit) => audit.month === auditMonthFilter);
  }, [data.audits, auditMonthFilter]);

  const auditMonthOptions = useMemo(() => {
    const months = new Set(data.audits.map((audit) => audit.month).filter(Boolean));
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [data.audits]);

  const auditsBySchool = useMemo(() => {
    const grouped = {};
    filteredAudits.forEach((audit) => {
      const schoolId = audit.school?._id || audit.school;
      if (!schoolId) return;
      if (!grouped[schoolId]) grouped[schoolId] = [];
      grouped[schoolId].push(audit);
    });
    return grouped;
  }, [filteredAudits]);

  const visibleAuditSchools = useMemo(() => {
    if (auditSchoolFilter === 'all') return data.schools;
    return data.schools.filter((s) => s._id === auditSchoolFilter);
  }, [data.schools, auditSchoolFilter]);

  const filteredSchoolsList = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase();
    if (!q) return data.schools;
    return data.schools.filter(
      (s) =>
        formatSchoolDisplayName(s.name).toLowerCase().includes(q) ||
        (s.code || '').toLowerCase().includes(q)
    );
  }, [data.schools, schoolSearch]);

  const pendingAuditLostCount = useMemo(
    () => countAuditLines(data.audits, 'lost', { amStatus: 'Pending' }),
    [data.audits],
  );

  const pendingAuditDamagedCount = useMemo(
    () => countAuditLines(data.audits, 'damaged', { amStatus: 'Pending' }),
    [data.audits],
  );

  const schoolAudits = selectedSchool
    ? (auditsBySchool[selectedSchool._id] || []).sort((a, b) => b.month.localeCompare(a.month) || new Date(b.createdAt) - new Date(a.createdAt))
    : [];

  const dispatchYearOptions = useMemo(() => {
    const years = new Set([new Date().getFullYear()]);
    data.dispatches.forEach((d) => {
      const date = dispatchDate(d);
      if (date) years.add(date.getFullYear());
    });
    return [...years].sort((a, b) => b - a);
  }, [data.dispatches]);

  const quantityMismatchIssues = useMemo(
    () => data.receiptIssues.filter((i) => i.issueType === 'Quantity Mismatch'),
    [data.receiptIssues],
  );
  const missingProductIssues = useMemo(
    () => data.receiptIssues.filter((i) => i.issueType === 'Missing Product' || i.issueType === 'Shipment Not Received'),
    [data.receiptIssues],
  );
  const damagedProductIssues = useMemo(
    () => data.receiptIssues.filter((i) => i.issueType === 'Damaged Product'),
    [data.receiptIssues],
  );
  const missingApprovalCount = missingProductIssues.length + data.requests.length;
  const lostApprovalCount = pendingAuditLostCount;
  const damagedApprovalCount = damagedProductIssues.length + pendingAuditDamagedCount;
  const totalAmApprovals = data.receiptIssues.length + data.requests.length + pendingAuditLostCount + pendingAuditDamagedCount;

  useEffect(() => {
    setAmApprovalCounts({
      total: totalAmApprovals,
      quantityMismatch: quantityMismatchIssues.length,
      missingProduct: missingApprovalCount,
      lostProduct: lostApprovalCount,
      damagedProduct: damagedApprovalCount,
    });
  }, [
    totalAmApprovals,
    quantityMismatchIssues.length,
    missingApprovalCount,
    lostApprovalCount,
    damagedApprovalCount,
    setAmApprovalCounts,
  ]);

  if (activeView === 'invalid') {
    return <Navigate to={ROUTES.am.schools} replace />;
  }

  if (activeView === 'approvals' && location.pathname.endsWith('/approvals/other')) {
    return <Navigate to={ROUTES.am.approvalsDamaged} replace />;
  }

  if (activeView === 'approvals' && location.pathname.startsWith(`${ROUTES.am.approvals}/`) && !approvalCategory) {
    return <Navigate to={ROUTES.am.approvals} replace />;
  }

  const approvalDetailCopy = {
    missing: {
      title: 'Missing product / not received',
      subtitle: 'From normal dispatch — school reported kits missing or shipment not received. Approve to send to admin.',
    },
    lost: {
      title: 'Lost product',
      subtitle: 'From monthly audit — school reported lost kits with evidence. Approve the audit report to continue workflow.',
    },
    damaged: {
      title: 'Damaged product',
      subtitle: 'From normal dispatch or monthly audit — approve to send to admin for replacement dispatch.',
    },
    mismatch: {
      title: 'Quantity mismatch',
      subtitle: 'From normal dispatch — received quantity does not match shipment. Approve to send to admin.',
    },
  };

  const headerCopy = {
    schools: { title: 'Schools', subtitle: 'Manage and track schools assigned to your division.' },
    dispatches: { title: 'Dispatches', subtitle: 'Select a school, then choose a month or year to view dispatches.' },
    audits: { title: 'Audit Reports', subtitle: 'Monthly audit submissions, grouped by school.' },
    approvals: isApprovalDetail
      ? approvalDetailCopy[approvalCategory]
      : {
        title: 'Approvals',
        subtitle: 'Review pending items from monthly audit and normal dispatch. Select a category below to manage specific requests.',
      },
  }[activeView];

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonLoader className="w-full h-24" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SkeletonLoader className="h-32" />
          <SkeletonLoader className="h-32" />
          <SkeletonLoader className="h-32" />
        </div>
        <SkeletonLoader className="h-96" />
      </div>
    );
  }

  if (showRegionPicker && !data.division) {
    return (
      <AmRegionPicker
        isOpen
        divisions={data.divisions}
        selectedId={selectedDivisionId}
        required
        onSelect={handleSelectRegion}
        onClose={() => {}}
      />
    );
  }

  const divisionName = data.division?.name || data.schools[0]?.divisionId?.name || (loadError ? '—' : 'Unassigned');
  const canSwitchRegion = data.divisions.length > 1;

  return (
    <div className="animate-fade-in duration-500">
      <AmRegionPicker
        isOpen={showRegionPicker}
        divisions={data.divisions}
        selectedId={data.division?._id || selectedDivisionId}
        required={!data.division}
        onSelect={handleSelectRegion}
        onClose={() => data.division && setShowRegionPicker(false)}
      />
      {loadError && (
        <div className="mb-6 p-4 rounded-xl border border-error-200 bg-error-50 text-error-800 text-sm font-medium">
          Could not load your division data: {loadError}. Try refreshing the page or signing in again.
        </div>
      )}
      <section className="stitch-banner relative mb-6 p-6 md:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--stitch-primary)]">Your region</p>
            <h2 className="mt-1 font-heading text-3xl font-extrabold text-[var(--stitch-text)]">{divisionName}</h2>
            {data.division?.description && (
              <p className="mt-1 text-sm text-[var(--stitch-muted)]">{data.division.description}</p>
            )}
            {canSwitchRegion && (
              <button
                type="button"
                onClick={() => setShowRegionPicker(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#F89C28]/30 bg-[#F89C28]/10 px-3 py-1.5 text-xs font-bold text-[#F89C28] transition hover:bg-[#F89C28]/20"
              >
                <RefreshCw size={14} />
                Switch region
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-8">
            {[
              { label: 'Schools', value: data.schools.length },
              { label: 'Dispatches', value: data.dispatches.length },
              { label: 'Audit Reports', value: data.audits.length },
              { label: 'Pending', value: totalAmApprovals, muted: totalAmApprovals === 0 },
            ].map((stat) => (
              <div key={stat.label} className="min-w-[72px] text-center lg:text-left">
                <p className={`font-heading text-2xl font-extrabold ${stat.muted ? 'text-[#9CA3AF]' : 'text-[var(--stitch-text)]'}`}>
                  {stat.value}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--stitch-muted)]">{stat.label}</p>
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute right-6 top-1/2 hidden h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--stitch-primary)]/10 text-[var(--stitch-primary)] xl:flex">
            <MapPin size={28} strokeWidth={1.5} />
          </div>
        </div>
      </section>

      <PageHeader title={headerCopy.title} subtitle={headerCopy.subtitle} />

      {activeView === 'schools' && (
        <>
          <div className="mb-6 space-y-4">
            <div className="flex max-w-[180px] flex-col gap-1.5">
              <label className="stitch-label">Report month</label>
              <input
                type="month"
                className="stitch-input"
                value={opsMonth}
                onChange={(e) => setOpsMonth(e.target.value)}
              />
            </div>
            <AmOperationsBoard
              month={opsSummary?.month || opsMonth}
              period={opsSummary?.period}
              current={opsSummary?.current}
              attention={opsSummary?.attention}
              loading={opsLoading}
            />
          </div>

          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="search"
                value={schoolSearch}
                onChange={(e) => setSchoolSearch(e.target.value)}
                placeholder="Search school..."
                className="stitch-input bg-white pl-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredSchoolsList.map((school) => {
              const schoolId = school._id;
              const pendingCount = data.requests.filter((r) => (r.school?._id || r.school) === schoolId).length;
              const dispatchCount = data.dispatches.filter((d) => (d.school?._id || d.school) === schoolId).length;
              const auditCount = (auditsBySchool[schoolId] || []).length;
              const hasMismatch = (auditsBySchool[schoolId] || []).some((a) => a.status === 'Mismatch');
              return (
                <div
                  key={school._id}
                  className={`stitch-card flex flex-col p-5 ${
                    hasMismatch ? 'border-b-4 border-b-[#EF4444]' : ''
                  }`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-bold uppercase tracking-wide text-[#1F2937]">
                        {formatSchoolDisplayName(school.name)}
                      </h3>
                      <p className="mt-1 text-xs font-medium text-[#6B7280]">
                        ID: {formatSchoolIdentityPrefix(school.code, school.joiningYear)}
                      </p>
                    </div>
                    {hasMismatch && (
                      <span className="shrink-0 rounded-full bg-[#EF4444]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#EF4444]">
                        Mismatch
                      </span>
                    )}
                  </div>
                  <div className="mb-4 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Dispatches</p>
                      <p className="text-sm font-bold text-[#1F2937]">{dispatchCount}</p>
                    </div>
                    <div className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Audits</p>
                      <p className="text-sm font-bold text-[#1F2937]">{auditCount}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenAuditForSchool(school)}
                    className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--stitch-border)] px-4 py-2.5 text-xs font-bold text-[var(--stitch-text)] transition hover:border-[var(--stitch-primary)] hover:text-[var(--stitch-primary)]"
                  >
                    View Audit Reports
                    <ArrowRight size={14} />
                  </button>
                  {pendingCount > 0 && (
                    <p className="mt-2 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 py-1.5 text-center text-xs font-bold text-[#F59E0B]">
                      {pendingCount} pending approval(s)
                    </p>
                  )}
                </div>
              );
            })}
            {filteredSchoolsList.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F8FAFC] px-6 py-14 text-center">
                <GraduationCap size={36} className="mb-3 text-[#D1D5DB]" />
                <p className="text-sm font-medium text-[#6B7280]">
                  {data.schools.length === 0
                    ? 'No schools are assigned to your division yet.'
                    : 'No schools match your search.'}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {activeView === 'dispatches' && (
        <>
          {!selectedDispatchSchool ? (
            <section className="stitch-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--stitch-border)] px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--stitch-primary)]/10 text-[var(--stitch-primary)]">
                    <GraduationCap size={20} />
                  </div>
                  <div>
                    <h3 className="font-heading text-lg font-bold text-[var(--stitch-text)]">Select a school</h3>
                    <p className="text-sm text-[var(--stitch-muted)]">Choose a school to view its dispatch history by month or year.</p>
                  </div>
                </div>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--stitch-muted)]">
                  Showing {data.schools.length} school{data.schools.length === 1 ? '' : 's'} available
                </p>
              </div>
              <div className="space-y-4 border-b border-[var(--stitch-border)] px-6 py-4">
                <div className="flex max-w-[180px] flex-col gap-1.5">
                  <label className="stitch-label">Report month</label>
                  <input
                    type="month"
                    className="stitch-input"
                    value={opsMonth}
                    onChange={(e) => setOpsMonth(e.target.value)}
                  />
                </div>
                <AmOperationsBoard
                  month={opsSummary?.month || opsMonth}
                  period={opsSummary?.period}
                  current={opsSummary?.current}
                  attention={opsSummary?.attention}
                  loading={opsLoading}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
                {data.schools.map((school) => {
                  const count = dispatchCountBySchool[school._id] || 0;
                  return (
                    <button
                      key={school._id}
                      type="button"
                      onClick={() => handleSelectDispatchSchool(school)}
                      className="stitch-card p-5 text-left transition hover:-translate-y-0.5 hover:border-[var(--stitch-primary)]/50"
                    >
                      <h3 className="font-bold uppercase tracking-wide text-[var(--stitch-text)]">
                        {formatSchoolDisplayName(school.name)}
                      </h3>
                      <p className="mt-1 text-xs text-[var(--stitch-muted)]">
                        ID: {formatSchoolIdentityPrefix(school.code, school.joiningYear)}
                      </p>
                      <p className="mt-3 text-xs font-bold text-[var(--stitch-primary)]">
                        {count} total dispatch{count === 1 ? '' : 'es'}
                      </p>
                    </button>
                  );
                })}
                {data.schools.length === 0 && (
                  <p className="col-span-full py-8 text-center text-[var(--stitch-muted)]">No schools in your division.</p>
                )}
              </div>
            </section>
          ) : (
            <section className="stitch-card overflow-hidden">
              <div className="space-y-4 border-b border-[var(--stitch-border)] px-6 py-6">
                <button
                  type="button"
                  onClick={() => setSelectedDispatchSchool(null)}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--stitch-primary)] transition hover:underline"
                >
                  <ArrowLeft size={14} />
                  All schools
                </button>
                <div>
                  <h3 className="font-heading text-xl font-bold text-[var(--stitch-text)]">
                    {formatSchoolDisplayName(selectedDispatchSchool.name)}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--stitch-muted)]">
                    School ID: {formatSchoolIdentityPrefix(selectedDispatchSchool.code, selectedDispatchSchool.joiningYear)}
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="stitch-label">View by</label>
                    <select
                      className="stitch-input min-w-[160px]"
                      value={dispatchPeriod}
                      onChange={(e) => {
                        const next = e.target.value;
                        setDispatchPeriod(next);
                        if (next === 'monthly' && !dispatchMonth) {
                          setDispatchMonth(defaultMonthValue());
                        }
                      }}
                    >
                      <option value="monthly">Month</option>
                      <option value="yearly">Year</option>
                    </select>
                  </div>
                  {dispatchPeriod === 'monthly' && (
                    <div className="flex flex-col gap-1.5">
                      <label className="stitch-label">Month</label>
                      <input
                        type="month"
                        className="stitch-input"
                        value={dispatchMonth}
                        onChange={(e) => setDispatchMonth(e.target.value)}
                      />
                    </div>
                  )}
                  {dispatchPeriod === 'yearly' && (
                    <div className="flex flex-col gap-1.5">
                      <label className="stitch-label">Year</label>
                      <select
                        className="stitch-input min-w-[120px]"
                        value={dispatchYear}
                        onChange={(e) => setDispatchYear(e.target.value)}
                      >
                        {dispatchYearOptions.map((year) => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <p className="text-sm font-bold text-[var(--stitch-primary)]">
                  {filteredDispatches.length} dispatch{filteredDispatches.length === 1 ? '' : 'es'} for this period
                </p>
                <AmOperationsBoard
                  month={opsSummary?.month || opsMonth}
                  period={opsSummary?.period}
                  current={opsSummary?.current}
                  attention={opsSummary?.attention}
                  loading={opsLoading}
                  onDownloadPdf={handleDownloadOpsPdf}
                  downloading={downloadingPdf}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="stitch-table-head">
                    <tr className="border-b border-[var(--stitch-border)]">
                      {['Dispatches', 'Kit Details', 'Qty', 'Status', 'Proof', 'Date', 'Action'].map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {filteredDispatches.map((d) => (
                      <tr key={d._id} className="transition hover:bg-[#F8FAFC]">
                        <td className="px-5 py-3.5">
                          <DispatchIdCell item={d} onViewHistory={() => setTrackingDispatch(d)} />
                        </td>
                        <td className="px-5 py-3.5"><KitDetailsCell item={d} showShippedDate={false} /></td>
                        <td className="px-5 py-3.5"><QuantityCell item={d} /></td>
                        <td className="px-5 py-3.5">
                          <Badge type={d.status === 'Delivery Completed' || d.status === 'Received' || d.status === 'Completed' ? 'success' : d.status === 'Pending' ? 'pending' : d.status === 'Dispatched' ? 'info' : 'error'}>
                            {d.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5">
                          {d.dispatchProofUrl
                            ? <DispatchProofPhoto url={d.dispatchProofUrl} size="sm" label="" />
                            : <span className="text-xs text-[#9CA3AF]">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-[#6B7280]">{dispatchDate(d)?.toLocaleDateString() || '—'}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-col items-start gap-2">
                            <button
                              type="button"
                              className="text-xs font-bold text-[#F89C28] hover:underline"
                              onClick={() => setTrackingDispatch(d)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="text-xs font-bold text-[#F89C28] hover:underline"
                              onClick={async () => {
                                try {
                                  await downloadDispatchInvoicePdf(api, `/am/dispatches/${d._id}/invoice`);
                                  toast.success('Invoice PDF downloaded');
                                } catch (err) {
                                  toast.error(err.response?.data?.message || 'Failed to download invoice PDF');
                                }
                              }}
                            >
                              Invoice PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredDispatches.length === 0 && (
                      <tr>
                        <td colSpan="7" className="px-5 py-10 text-center text-[#6B7280]">
                          No dispatches for this school in the selected period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-[#E5E7EB] bg-[#F8FAFC]/50 px-6 py-3 text-sm text-[#6B7280]">
                Showing {filteredDispatches.length} dispatch{filteredDispatches.length === 1 ? '' : 'es'}
              </div>
            </section>
          )}
        </>
      )}

      {activeView === 'audits' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex max-w-sm flex-1 flex-col gap-1.5">
              <label className="stitch-label">Filter by school</label>
              <select
                className="stitch-input bg-white"
                value={auditSchoolFilter}
                onChange={(e) => setAuditSchoolFilter(e.target.value)}
              >
                <option value="all">All schools in division</option>
                {data.schools.map((school) => (
                  <option key={school._id} value={school._id}>{formatSchoolDisplayName(school.name)}</option>
                ))}
              </select>
            </div>
            <div className="flex max-w-sm flex-1 flex-col gap-1.5">
              <label className="stitch-label">Filter by month</label>
              <select
                className="stitch-input bg-white"
                value={auditMonthFilter}
                onChange={(e) => setAuditMonthFilter(e.target.value)}
              >
                <option value="all">All months</option>
                {auditMonthOptions.map((month) => (
                  <option key={month} value={month}>{formatAuditMonthLabel(month)}</option>
                ))}
              </select>
            </div>
          </div>

          {visibleAuditSchools.map((school) => {
            const reports = (auditsBySchool[school._id] || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const reportsByMonth = groupAuditsByMonth(reports);
            return (
              <section key={school._id} className="stitch-card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--stitch-border)] px-6 py-4">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--stitch-muted)]">
                    {formatSchoolDisplayName(school.name)}
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleOpenAuditForSchool(school)}
                    className="text-sm font-bold text-[var(--stitch-primary)] hover:underline"
                  >
                    View School Profile
                  </button>
                </div>
                {reportsByMonth.length > 0 ? (
                  <div className="divide-y divide-[#E5E7EB]">
                    {reportsByMonth.map(([month, monthAudits]) => (
                      <div key={month} className="space-y-4 p-5">
                        {monthAudits.map((audit) => (
                          <div
                            key={audit._id}
                            className={`rounded-xl border p-4 ${
                              audit.status === 'Mismatch' ? 'border-[#EF4444]/30 bg-[#EF4444]/5' : 'border-[#E5E7EB] bg-white'
                            }`}
                          >
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <h4 className="text-sm font-extrabold uppercase tracking-wide text-[#1F2937]">
                                  {formatAuditMonthLabel(month)}
                                </h4>
                                <p className="mt-0.5 text-xs text-[#6B7280]">
                                  Submitted: {new Date(audit.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge type={audit.status === 'Mismatch' ? 'error' : 'success'}>{audit.status}</Badge>
                                <Badge type={
                                  audit.workflowStatus === 'Approved' ? 'success'
                                    : audit.workflowStatus === 'Rejected' ? 'error'
                                      : audit.workflowStatus === 'Pending Admin Approval' ? 'pending' : 'warning'
                                }>
                                  {audit.workflowStatus || 'Pending AM Approval'}
                                </Badge>
                                {audit.workflowStatus === 'Pending AM Approval' && (
                                  <>
                                    <button
                                      type="button"
                                      className="rounded-lg bg-[#F89C28] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#E88914]"
                                      onClick={() => handleAuditAction(audit._id, 'approve')}
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-lg bg-[#EF4444] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#DC2626]"
                                      onClick={() => handleAuditAction(audit._id, 'reject')}
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            <AuditReportDetails audit={audit} showWorkflow />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-[#6B7280]">No audit reports for the selected filters.</p>
                )}
              </section>
            );
          })}

          {visibleAuditSchools.length === 0 && (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white py-10 text-center text-[#6B7280]">
              No schools in your division.
            </div>
          )}
        </div>
      )}

      {isApprovalGrid && (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-2xl border border-[var(--stitch-border)] bg-[var(--stitch-canvas)] px-5 py-4 text-sm text-[var(--stitch-muted)]">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--stitch-primary)]/15 text-xs font-bold text-[var(--stitch-primary)]">i</span>
            <p>
              All approval requests appear here from two sources:
              <span className="font-semibold text-[var(--stitch-text)]"> Monthly audit</span> (lost/damaged kits with evidence)
              and <span className="font-semibold text-[var(--stitch-text)]"> normal dispatch</span> (receipt issues after shipment).
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            <AmApprovalTile
              title="Missing product"
              subtitle="Normal dispatch — missing kits or shipment not received."
              count={missingApprovalCount}
              icon={PackageX}
              onClick={() => navigate(APPROVAL_CATEGORY_PATHS.missing)}
              accentClass="border-t-[#EF4444]"
            />
            <AmApprovalTile
              title="Lost product"
              subtitle="Monthly audit — lost kits reported with evidence."
              count={lostApprovalCount}
              icon={PackageMinus}
              onClick={() => navigate(APPROVAL_CATEGORY_PATHS.lost)}
              accentClass="border-t-[#475569]"
            />
            <AmApprovalTile
              title="Damaged product"
              subtitle="Normal dispatch or monthly audit — damaged kits."
              count={damagedApprovalCount}
              icon={ShieldAlert}
              onClick={() => navigate(APPROVAL_CATEGORY_PATHS.damaged)}
              accentClass="border-t-[#3B82F6]"
            />
            <AmApprovalTile
              title="Quantity mismatch"
              subtitle="Normal dispatch — received qty does not match shipment."
              count={quantityMismatchIssues.length}
              icon={Scale}
              onClick={() => navigate(APPROVAL_CATEGORY_PATHS.mismatch)}
              accentClass="border-t-[#F89C28]"
            />
          </div>
        </div>
      )}

      {isApprovalDetail && (
        <>
          <button
            type="button"
            className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-[#F89C28] hover:underline"
            onClick={() => navigate(ROUTES.am.approvals)}
          >
            <ArrowLeft size={16} />
            Back to categories
          </button>

          {approvalCategory === 'missing' && (
            <AmApprovalSection
              title="Missing product"
              subtitle="Normal dispatch — missing kits or shipment not received. Approve to send to admin."
              count={missingApprovalCount}
            >
              {missingProductIssues.length > 0 && (
                <>
                  <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Normal dispatch — receipt issues</p>
                  <ReceiptIssueTable
                    issues={missingProductIssues}
                    onAction={handleReceiptIssueAction}
                    emptyMessage="No missing product issues pending."
                  />
                </>
              )}
              {data.requests.length > 0 && (
                <div className={missingProductIssues.length > 0 ? 'border-t border-slate-100' : ''}>
                  {missingProductIssues.length > 0 && (
                    <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Normal dispatch — replacement requests</p>
                  )}
                  <ReplacementRequestTable
                    requests={data.requests}
                    onAction={handleAction}
                    emptyMessage="No lost kit replacements pending."
                  />
                </div>
              )}
              {missingApprovalCount === 0 && (
                <p className="text-center py-10 text-slate-500">No missing product issues pending.</p>
              )}
            </AmApprovalSection>
          )}

          {approvalCategory === 'lost' && (
            <AmApprovalSection
              title="Lost product"
              subtitle="Monthly audit — approve lost kits only. Damaged kits stay under Damaged product until you approve them separately."
              count={lostApprovalCount}
            >
              <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Monthly audit — lost kits</p>
              <AmAuditApprovalList
                audits={data.audits}
                lineType="lost"
                onAuditAction={handleAuditAction}
                emptyMessage="No lost kits from monthly audit pending."
              />
            </AmApprovalSection>
          )}

          {approvalCategory === 'damaged' && (
            <AmApprovalSection
              title="Damaged product"
              subtitle="Normal dispatch or monthly audit — approve to send to admin."
              count={damagedApprovalCount}
            >
              {pendingAuditDamagedCount > 0 && (
                <>
                  <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Monthly audit — damaged kits</p>
                  <AmAuditApprovalList
                    audits={data.audits}
                    lineType="damaged"
                    onAuditAction={handleAuditAction}
                    emptyMessage="No damaged kits from monthly audit pending."
                  />
                </>
              )}
              {damagedProductIssues.length > 0 && (
                <div className={pendingAuditDamagedCount > 0 ? 'border-t border-slate-100' : ''}>
                  {pendingAuditDamagedCount > 0 && (
                    <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Normal dispatch — receipt issues</p>
                  )}
                  <ReceiptIssueTable
                    issues={damagedProductIssues}
                    onAction={handleReceiptIssueAction}
                    emptyMessage="No damaged product issues pending."
                  />
                </div>
              )}
              {damagedApprovalCount === 0 && (
                <p className="text-center py-10 text-slate-500">No damaged product issues pending.</p>
              )}
            </AmApprovalSection>
          )}

          {approvalCategory === 'mismatch' && (
            <AmApprovalSection
              title="Quantity mismatch"
              subtitle="Normal dispatch — received quantity does not match shipment. Approve to send to admin."
              count={quantityMismatchIssues.length}
            >
              <ReceiptIssueTable
                issues={quantityMismatchIssues}
                onAction={handleReceiptIssueAction}
                emptyMessage="No quantity mismatch issues pending."
              />
            </AmApprovalSection>
          )}
        </>
      )}

      {activeView === 'approvals' && !isApprovalGrid && !isApprovalDetail && (
        <Navigate to={ROUTES.am.approvals} replace />
      )}

      <Modal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        title={`Audit History | ${formatSchoolDisplayName(selectedSchool?.name)}`}
        className="max-w-4xl max-h-[85vh] overflow-y-auto"
      >
        <div className="space-y-6">
          {schoolAudits.map((audit) => (
            <div key={audit._id} className={`border rounded-xl p-5 ${audit.status === 'Mismatch' ? 'border-error-200 bg-error-50/20' : 'border-success-200 bg-success-50/10'}`}>
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-200/50">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-lg">Month: {audit.month}</h4>
                  <p className="text-xs text-slate-500 mt-1">Submitted on: {new Date(audit.createdAt).toLocaleDateString()}</p>
                </div>
                <Badge type={audit.status === 'Mismatch' ? 'error' : 'success'}>{audit.status}</Badge>
              </div>
              <AuditReportDetails audit={audit} />
            </div>
          ))}
          {schoolAudits.length === 0 && <p className="text-center py-10 text-slate-500">No audits found for this school.</p>}
        </div>
      </Modal>

      <DispatchTrackingModal
        dispatch={trackingDispatch}
        isOpen={!!trackingDispatch}
        onClose={() => setTrackingDispatch(null)}
      />
    </div>
  );
};

export default AMDashboard;
