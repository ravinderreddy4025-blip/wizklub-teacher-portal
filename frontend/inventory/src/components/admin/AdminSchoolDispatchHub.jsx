import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Package, History, PackageX, Scale, ShieldAlert, Search } from 'lucide-react';
import api from '../../utils/api';
import Badge from '../ui/Badge';
import Pagination from '../shared/Pagination';
import { DispatchIdCell, KitDetailsCell, QuantityCell, IssueShipmentDetailsCell } from '../shared/DispatchRedispatchCells';
import DispatchTrackingModal from '../shared/DispatchTrackingModal';
import AdminEditTrackingModal from './AdminEditTrackingModal';
import { formatSchoolDisplayName } from '../../utils/schoolName';
import { canAdminEditTracking, getDispatchTrackingValue, isTrackingOverdue } from '../../utils/dispatchTracking';
import toast from '../../utils/toast';
import OperationsKpiPanel from '../shared/OperationsKpiPanel';
import downloadPdfBlob from '../../utils/downloadPdfBlob';

const SECTIONS = [
  {
    id: 'incoming',
    label: 'Incoming',
    subtitle: 'In transit or awaiting receipt',
    icon: Package,
    iconWrap: 'bg-[#F89C28]/10 text-[#F89C28]',
    bar: 'bg-[#F89C28]',
    activeBorder: 'border-2 border-[#F89C28] shadow-lg shadow-orange-100/50',
  },
  {
    id: 'past',
    label: 'Completed',
    subtitle: 'Completed or closed shipments',
    icon: History,
    iconWrap: 'bg-[#F1F5F9] text-[#64748B]',
    bar: 'bg-[#94A3B8]',
    activeBorder: 'border-2 border-[#94A3B8] shadow-lg shadow-slate-100',
  },
  {
    id: 'lost',
    label: 'Lost / not received',
    subtitle: 'Devices reported missing',
    icon: PackageX,
    iconWrap: 'bg-[#EF4444]/10 text-[#EF4444]',
    bar: 'bg-[#EF4444]',
    activeBorder: 'border-2 border-[#EF4444] shadow-lg shadow-red-100/50',
  },
  {
    id: 'mismatch',
    label: 'Mismatch',
    subtitle: 'Quantity does not match',
    icon: Scale,
    iconWrap: 'bg-[#6366F1]/10 text-[#6366F1]',
    bar: 'bg-[#6366F1]',
    activeBorder: 'border-2 border-[#6366F1] shadow-lg shadow-indigo-100/50',
  },
  {
    id: 'damaged',
    label: 'Damaged',
    subtitle: 'Devices reported damaged',
    icon: ShieldAlert,
    iconWrap: 'bg-[#F59E0B]/10 text-[#F59E0B]',
    bar: 'bg-[#F59E0B]',
    activeBorder: 'border-2 border-[#F59E0B] shadow-lg shadow-amber-100/50',
  },
];

export function defaultDispatchMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function dispatchBadgeType(status) {
  if (status === 'Delivery Completed' || status === 'Received') return 'success';
  if (status === 'Pending') return 'pending';
  if (status === 'Dispatched') return 'info';
  return 'error';
}

function issueBadgeType(issueType) {
  if (issueType === 'Damaged Product' || issueType === 'Shipment Not Received') return 'error';
  if (issueType === 'Quantity Mismatch') return 'info';
  return 'warning';
}

function SummaryTile({ section, summary, active, onClick }) {
  const Icon = section.icon;
  const stats = summary?.[section.id] || { count: 0, units: 0 };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl bg-white p-5 text-left transition-all ${
        active
          ? section.activeBorder
          : 'border border-[#E5E7EB] hover:border-[#D1D5DB] hover:shadow-md'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${section.iconWrap}`}>
          <Icon size={20} strokeWidth={1.75} />
        </div>
        <div className="text-right">
          <p className="font-heading text-xl font-extrabold text-[#1F2937]">{stats.units}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">units</p>
        </div>
      </div>
      <p className="text-sm font-bold text-[#1F2937]">{section.label}</p>
      <p className="mt-0.5 text-xs text-[#6B7280]">
        {stats.count} record{stats.count === 1 ? '' : 's'}
      </p>
      <div className={`mt-4 h-1 w-full rounded-full ${section.bar}`} />
    </button>
  );
}

function DispatchTable({ rows, onView, onEditTracking }) {
  if (!rows.length) {
    return (
      <p className="py-12 text-center text-[#6B7280]">
        No dispatches in this section for the selected month.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[#E5E7EB] bg-[#F89C28]/5">
            {['Dispatch ID', 'Kit Details', 'Qty', 'Status', 'Date', 'Action'].map((col) => (
              <th
                key={col}
                className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[#F89C28]"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E7EB]">
          {rows.map((d) => {
            const canEdit = canAdminEditTracking(d);
            const hasTracking = !!getDispatchTrackingValue(d);
            const overdue = isTrackingOverdue(d);
            return (
              <tr key={d._id} className="transition hover:bg-[#F8FAFC]">
                <td className="px-5 py-4">
                  <DispatchIdCell item={d} onViewHistory={() => onView(d)} />
                </td>
                <td className="px-5 py-4">
                  <KitDetailsCell item={d} showShippedDate={false} />
                </td>
                <td className="px-5 py-4">
                  <QuantityCell item={d} />
                </td>
                <td className="px-5 py-4">
                  <Badge type={dispatchBadgeType(d.status)}>{d.status}</Badge>
                </td>
                <td className="px-5 py-4 text-sm font-medium text-[#6B7280]">
                  {new Date(d.dispatchedAt || d.createdAt).toLocaleDateString()}
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-col items-start gap-2">
                    <button
                      type="button"
                      onClick={() => onView(d)}
                      className="min-w-[100px] rounded-lg border border-[#E5E7EB] px-4 py-1.5 text-xs font-semibold text-[#1F2937] transition hover:bg-white hover:shadow-sm"
                    >
                      View
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onEditTracking(d)}
                        className={`min-w-[100px] rounded-lg border px-4 py-1.5 text-xs font-semibold transition ${
                          overdue
                            ? 'border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444] hover:bg-[#EF4444] hover:text-white'
                            : 'border-[#F89C28]/20 bg-[#F89C28]/5 text-[#F89C28] hover:bg-[#F89C28] hover:text-white'
                        }`}
                      >
                        {hasTracking ? 'Edit tracking' : 'Add tracking'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IssueTable({ rows }) {
  if (!rows.length) {
    return (
      <p className="py-12 text-center text-[#6B7280]">
        No issues reported in this section for the selected month.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[#E5E7EB] bg-[#F89C28]/5">
            {['Source', 'Kit', 'Issue', 'Units affected', 'Dispatch / ref', 'Status', 'Reported'].map((col) => (
              <th
                key={col}
                className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[#F89C28]"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E7EB]">
          {rows.map((row) => {
            if (row.recordType === 'replacement_request') {
              const req = row.item;
              return (
                <tr key={`req-${req._id}`} className="transition hover:bg-[#F8FAFC]">
                  <td className="px-5 py-4">
                    <Badge type="pending">{req.type === 'Damaged' ? 'Damaged kit request' : 'Lost kit request'}</Badge>
                  </td>
                  <td className="px-5 py-4 font-bold text-[#1F2937]">{req.kit?.name || '—'}</td>
                  <td className="px-5 py-4"><Badge type="warning">{req.type}</Badge></td>
                  <td className="px-5 py-4 font-bold text-[#1F2937]">{req.quantity}</td>
                  <td className="px-5 py-4 font-mono text-xs text-[#6B7280]">{req.replacementId || '—'}</td>
                  <td className="px-5 py-4"><Badge type="info">{req.status}</Badge></td>
                  <td className="px-5 py-4 text-sm text-[#6B7280]">{new Date(req.createdAt).toLocaleDateString()}</td>
                </tr>
              );
            }
            const issue = row.item;
            return (
              <tr key={`issue-${issue._id}`} className="transition hover:bg-[#F8FAFC]">
                <td className="px-5 py-4"><Badge type="info">Receipt report</Badge></td>
                <td className="px-5 py-4 font-bold text-[#1F2937]">{issue.kit?.name || '—'}</td>
                <td className="px-5 py-4"><Badge type={issueBadgeType(issue.issueType)}>{issue.issueType}</Badge></td>
                <td className="px-5 py-4 font-bold text-[#1F2937]">{issue.quantityAffected}</td>
                <td className="px-5 py-4">
                  <p className="font-mono text-xs text-[#6B7280]">
                    {issue.sourceDispatchRef || issue.dispatch?.dispatchId || '—'}
                  </p>
                  <IssueShipmentDetailsCell issue={issue} />
                </td>
                <td className="px-5 py-4"><Badge type="warning">{issue.status}</Badge></td>
                <td className="px-5 py-4 text-sm text-[#6B7280]">
                  {new Date(issue.receivedAt || issue.createdAt).toLocaleDateString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminSchoolDispatchHub({
  school,
  division,
  onBack,
  onCreateDispatch,
}) {
  const [month, setMonth] = useState(defaultDispatchMonth());
  const [section, setSection] = useState('incoming');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [kind, setKind] = useState('dispatches');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [trackingDispatch, setTrackingDispatch] = useState(null);
  const [editTrackingDispatch, setEditTrackingDispatch] = useState(null);
  const [trackingSubmitting, setTrackingSubmitting] = useState(false);
  const [opsSummary, setOpsSummary] = useState(null);
  const [opsLoading, setOpsLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [month, section, debouncedSearch]);

  const fetchHub = useCallback(async () => {
    if (!school?._id) return;
    try {
      setLoading(true);
      const res = await api.get(`/admin/schools/${school._id}/dispatch-hub`, {
        params: {
          month,
          section,
          page,
          limit: 20,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
      });
      setSummary(res.data.summary);
      setKind(res.data.kind);
      setRows(res.data.data || []);
      setTotal(res.data.total ?? 0);
      setTotalPages(res.data.totalPages ?? 1);
    } catch (err) {
      console.error(err);
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [school?._id, month, section, page, debouncedSearch]);

  useEffect(() => {
    fetchHub();
  }, [fetchHub]);

  useEffect(() => {
    if (!school?._id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        setOpsLoading(true);
        const res = await api.get('/admin/reports/monthly', {
          params: { month, schoolId: school._id },
        });
        if (!cancelled) setOpsSummary(res.data.summary || null);
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
  }, [school?._id, month]);

  const handleDownloadPdf = async () => {
    if (!school?._id) return;
    try {
      setDownloadingPdf(true);
      const res = await api.get(`/admin/reports/school/${school._id}/pdf`, {
        params: { month },
        responseType: 'blob',
      });
      const safeName = (school.name || 'school').replace(/[^\w-]+/g, '_').slice(0, 40);
      downloadPdfBlob(res.data, `wizklub-report-${safeName}-${month}.pdf`);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error('Failed to download school report PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const activeSection = SECTIONS.find((s) => s.id === section) || SECTIONS[0];

  return (
    <section className="stitch-card overflow-hidden">
      <div className="space-y-5 border-b border-[var(--stitch-border)] px-6 py-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--stitch-border)] bg-[var(--stitch-canvas)] px-3 py-1.5 text-sm font-medium text-[var(--stitch-muted)] transition hover:border-[var(--stitch-primary)]/40 hover:text-[var(--stitch-primary)]"
        >
          <ArrowLeft size={14} />
          {division?.name || 'All schools'}
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-xl font-bold text-[var(--stitch-text)] md:text-2xl">
              {formatSchoolDisplayName(school?.name)}
            </h3>
            <span className="mt-1.5 inline-block rounded-md bg-[#F1F5F9] px-2 py-0.5 font-mono text-xs text-[var(--stitch-muted)]">
              School ID: {school?.code || '—'}
            </span>
          </div>
          <button type="button" onClick={onCreateDispatch} className="stitch-btn-ghost">
            + Create dispatch
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="stitch-label">Month</label>
            <input
              type="month"
              className="stitch-input min-w-[160px] font-medium"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <p className="pb-2 text-sm text-[#6B7280]">
            Viewing <span className="font-semibold text-[#1F2937]">{activeSection.label}</span> for{' '}
            <span className="font-semibold text-[#1F2937]">{month}</span>
          </p>
        </div>

        <OperationsKpiPanel
          summary={opsSummary}
          loading={opsLoading}
          onDownloadPdf={handleDownloadPdf}
          downloading={downloadingPdf}
        />

        {summary && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {SECTIONS.map((s) => (
              <SummaryTile
                key={s.id}
                section={s}
                summary={summary}
                active={section === s.id}
                onClick={() => setSection(s.id)}
              />
            ))}
          </div>
        )}

        {(section === 'incoming' || section === 'past') && (
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dispatch ID or tracking..."
              className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] py-3 pl-12 pr-4 text-sm text-[#1F2937] outline-none transition focus:border-[#F89C28] focus:ring-2 focus:ring-[#F89C28]/15"
            />
          </div>
        )}
      </div>

      <div className="px-6 py-5">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-[#9CA3AF]">
          {activeSection.label}
        </p>
        <p className="mb-4 text-sm text-[#6B7280]">{activeSection.subtitle}</p>
        {loading ? (
          <p className="py-12 text-center text-[#6B7280]">Loading…</p>
        ) : kind === 'dispatches' ? (
          <DispatchTable
            rows={rows}
            onView={setTrackingDispatch}
            onEditTracking={setEditTrackingDispatch}
          />
        ) : (
          <IssueTable rows={rows} />
        )}
      </div>

      <div className="border-t border-[#E5E7EB] bg-[#F8FAFC]/50 px-6 py-4">
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      </div>

      <DispatchTrackingModal
        dispatch={trackingDispatch}
        isOpen={!!trackingDispatch}
        onClose={() => setTrackingDispatch(null)}
      />

      <AdminEditTrackingModal
        dispatch={editTrackingDispatch}
        isOpen={!!editTrackingDispatch}
        submitting={trackingSubmitting}
        onClose={() => !trackingSubmitting && setEditTrackingDispatch(null)}
        onSubmit={async ({ consignmentNo }) => {
          if (!editTrackingDispatch?._id) return;
          try {
            setTrackingSubmitting(true);
            await api.patch(`/admin/dispatches/${editTrackingDispatch._id}/tracking`, { consignmentNo });
            toast.success('Tracking updated');
            setEditTrackingDispatch(null);
            fetchHub();
          } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update tracking');
          } finally {
            setTrackingSubmitting(false);
          }
        }}
      />
    </section>
  );
}
