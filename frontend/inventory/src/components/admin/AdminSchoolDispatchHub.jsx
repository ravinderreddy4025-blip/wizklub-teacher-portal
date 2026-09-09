import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Package, History, Search } from 'lucide-react';
import api from '../../utils/api';
import Badge from '../ui/Badge';
import Pagination from '../shared/Pagination';
import { DispatchIdCell, KitDetailsCell, QuantityCell, IssueShipmentDetailsCell } from '../shared/DispatchRedispatchCells';
import DispatchTrackingModal from '../shared/DispatchTrackingModal';
import AdminEditTrackingModal from './AdminEditTrackingModal';
import { formatSchoolDisplayName } from '../../utils/schoolName';
import { formatSchoolIdentityPrefix } from '../../utils/componentId';
import SchoolIdentityEditor from './SchoolIdentityEditor';
import { canAdminEditTracking, getDispatchTrackingValue, isTrackingOverdue } from '../../utils/dispatchTracking';
import toast from '../../utils/toast';
import AdminOperationsBoard from './AdminOperationsBoard';
import downloadPdfBlob, { downloadDispatchInvoicePdf } from '../../utils/downloadPdfBlob';
import AuditHistoryList from '../shared/AuditHistoryList';
import { rowListQuantity } from '../../utils/unitAnalytics';

const HUB_TABS = [
  { id: 'activity', label: 'Dispatch activity' },
  { id: 'issues', label: 'Issues' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'audit', label: 'Audit' },
];

const ACTIVITY_SECTIONS = [
  {
    id: 'incoming',
    label: 'Incoming',
    hint: 'Open shipments waiting for receipt',
    icon: Package,
    color: '#F89C28',
    track: '#FFF4E5',
    activeBorder: 'border-[#F89C28]/70 bg-white shadow-sm',
  },
  {
    id: 'past',
    label: 'Completed',
    hint: 'Responded with at least one OK kit',
    icon: History,
    color: '#64748B',
    track: '#F1F5F9',
    activeBorder: 'border-[#64748B]/50 bg-white shadow-sm',
  },
  {
    id: 'history',
    label: 'History',
    hint: 'Every dispatch this month, including Not Received',
    icon: History,
    color: '#0F172A',
    track: '#E2E8F0',
    activeBorder: 'border-[#0F172A]/40 bg-white shadow-sm',
  },
];

const ISSUE_TYPES = [
  { id: '', label: 'All types' },
  { id: 'notReceived', label: 'Not Received' },
  { id: 'lost', label: 'Lost' },
  { id: 'mismatch', label: 'Mismatch' },
  { id: 'damaged', label: 'Damaged' },
];

const ISSUE_STATUSES = [
  { id: '', label: 'All statuses' },
  { id: 'pending', label: 'Pending' },
  { id: 'pendingAm', label: 'Pending AM' },
  { id: 'pendingAdmin', label: 'Pending Admin' },
  { id: 'clarification', label: 'Clarification' },
  { id: 'approved', label: 'Approved' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'rejected', label: 'Rejected' },
];

export function defaultDispatchMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function dispatchBadgeType(status) {
  if (status === 'Delivery Completed' || status === 'Received' || status === 'Completed') return 'success';
  if (status === 'Pending') return 'pending';
  if (status === 'Dispatched') return 'info';
  return 'error';
}

function dispatchStatusLabel(d) {
  if (d.status === 'Completed') {
    return Number(d.outstandingQuantity) > 0 ? 'Cycle completed' : 'Fulfilled';
  }
  if (['missing_dispatch', 'damaged_dispatch', 'mismatch_dispatch', 'not_received_dispatch'].includes(d.status)) {
    return 'Completed';
  }
  return d.status;
}

function issueBadgeType(issueType) {
  if (issueType === 'Damaged Product' || issueType === 'Shipment Not Received') return 'error';
  if (issueType === 'Quantity Mismatch') return 'info';
  return 'warning';
}

function issueStatusBadge(status) {
  if (status === 'Approved' || status === 'Resolved') return 'success';
  if (status === 'Rejected') return 'error';
  return 'warning';
}

function SummaryTile({ section, summary, active, onClick }) {
  const Icon = section.icon;
  const stats = summary?.[section.id] || { count: 0, units: 0 };
  const records = stats.count || 0;
  const primary = section.id === 'history' || section.id === 'issues' ? records : (stats.units || records);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative z-0 w-full rounded-xl border px-3 py-3 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm ${
        active
          ? section.activeBorder
          : 'border-[#E5E7EB] bg-[#F8FAFC]/80 hover:border-[#F89C28]/40'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{ background: section.track, color: section.color }}
        >
          <Icon size={14} />
        </span>
      </div>
      <p className="font-heading text-xl font-bold tabular-nums text-[#1F2937]">{primary}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">{section.label}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-[#9CA3AF]">{section.hint}</p>
      <p className="mt-1 text-[10px] font-semibold tabular-nums" style={{ color: section.color }}>
        {stats.units || 0} units · {records} record{records === 1 ? '' : 's'}
      </p>
    </button>
  );
}

function DispatchTable({ rows, onView, onEditTracking, onDownloadInvoice, section }) {
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
                  <Badge type={dispatchBadgeType(d.status)}>{dispatchStatusLabel(d)}</Badge>
                  {d.receiptIssue?.issueType && (
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                      {d.receiptIssue.issueType}
                      {d.receiptIssue.status ? ` · ${d.receiptIssue.status}` : ''}
                    </p>
                  )}
                </td>
                <td className="px-5 py-4 text-sm font-medium text-[#6B7280]">
                  {new Date(
                    (section === 'past' && d.receivedAt) || d.dispatchedAt || d.createdAt
                  ).toLocaleDateString()}
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
                    {onDownloadInvoice && (
                      <button
                        type="button"
                        onClick={() => onDownloadInvoice(d)}
                        className="min-w-[100px] rounded-lg border border-[#F89C28]/20 bg-[#F89C28]/5 px-4 py-1.5 text-xs font-semibold text-[#F89C28] transition hover:bg-[#F89C28] hover:text-white"
                      >
                        Invoice PDF
                      </button>
                    )}
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
        <tfoot>
          <tr className="border-t-2 border-[#E5E7EB] bg-[#FFFAF3]">
            <td className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#6B7280]" colSpan={2}>
              {section === 'past' ? 'Acknowledged OK total' : 'Qty column total'}
            </td>
            <td className="px-5 py-3 font-heading text-sm font-bold tabular-nums text-[#1F2937]">
              {rows.reduce((sum, row) => sum + rowListQuantity(row), 0)}
            </td>
            <td className="px-5 py-3 text-xs text-[#6B7280]" colSpan={3}>
              {rows.length} record{rows.length === 1 ? '' : 's'}
              {section === 'past' ? ' — same OK kits as Acknowledged' : ' — shipped units on this page'}
            </td>
          </tr>
        </tfoot>
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
                <td className="px-5 py-4"><Badge type={issueStatusBadge(issue.status)}>{issue.status}</Badge></td>
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

function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.id || 'all'}
          type="button"
          onClick={() => onChange(option.id)}
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
            value === option.id
              ? 'border-[#F89C28] bg-[#F89C28] text-white'
              : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#F89C28]/40'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function AdminSchoolDispatchHub({
  school,
  division,
  onBack,
  onCreateDispatch,
  onUpdateSchoolIdentity,
}) {
  const [month, setMonth] = useState(defaultDispatchMonth());
  const [hubTab, setHubTab] = useState('activity');
  const [section, setSection] = useState('incoming');
  const [issueType, setIssueType] = useState('');
  const [issueStatus, setIssueStatus] = useState('');
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
  const [opsData, setOpsData] = useState(null);
  const [opsLoading, setOpsLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [audits, setAudits] = useState([]);
  const [auditsLoading, setAuditsLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [month, section, hubTab, issueType, issueStatus, debouncedSearch]);

  const fetchHub = useCallback(async () => {
    if (!school?._id || hubTab === 'inventory' || hubTab === 'audit') return;
    try {
      setLoading(true);
      const res = await api.get(`/admin/schools/${school._id}/dispatch-hub`, {
        params: {
          month,
          section: hubTab === 'issues' ? 'issues' : section,
          page,
          limit: 20,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(hubTab === 'issues' && issueType ? { issueType } : {}),
          ...(hubTab === 'issues' && issueStatus ? { issueStatus } : {}),
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
  }, [school?._id, month, section, page, debouncedSearch, hubTab, issueType, issueStatus]);

  useEffect(() => {
    fetchHub();
  }, [fetchHub]);

  useEffect(() => {
    if (!school?._id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        setOpsLoading(true);
        const res = await api.get('/admin/operations', {
          params: { month, schoolId: school._id },
        });
        if (!cancelled) setOpsData(res.data || null);
      } catch (err) {
        console.error(err);
        if (!cancelled) setOpsData(null);
      } finally {
        if (!cancelled) setOpsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [school?._id, month]);

  useEffect(() => {
    if (!school?._id || hubTab !== 'inventory') return undefined;
    let cancelled = false;
    (async () => {
      try {
        setInventoryLoading(true);
        const res = await api.get(`/admin/schools/${school._id}/inventory`);
        if (!cancelled) setInventory(res.data.inventory || []);
      } catch (err) {
        console.error(err);
        if (!cancelled) setInventory([]);
      } finally {
        if (!cancelled) setInventoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [school?._id, hubTab]);

  useEffect(() => {
    if (!school?._id || hubTab !== 'audit') return undefined;
    let cancelled = false;
    (async () => {
      try {
        setAuditsLoading(true);
        const res = await api.get('/admin/audits', { params: { schoolId: school._id, limit: 50 } });
        if (!cancelled) setAudits(res.data.data || res.data.audits || []);
      } catch (err) {
        console.error(err);
        if (!cancelled) setAudits([]);
      } finally {
        if (!cancelled) setAuditsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [school?._id, hubTab]);

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

  const activeSection = ACTIVITY_SECTIONS.find((s) => s.id === section) || ACTIVITY_SECTIONS[0];

  return (
    <section className="stitch-card">
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
            {onUpdateSchoolIdentity ? (
              <div className="mt-3 max-w-md">
                <SchoolIdentityEditor
                  school={school}
                  onSave={(updates) => onUpdateSchoolIdentity(school._id, updates)}
                  compact
                />
              </div>
            ) : (
              <span className="mt-1.5 inline-block rounded-md bg-[#F1F5F9] px-2 py-0.5 font-mono text-xs text-[var(--stitch-muted)]">
                {formatSchoolIdentityPrefix(school?.code, school?.joiningYear)}
              </span>
            )}
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
        </div>

        <AdminOperationsBoard
          month={opsData?.month || month}
          period={opsData?.period}
          current={opsData?.current}
          loading={opsLoading}
          onDownloadPdf={handleDownloadPdf}
          downloading={downloadingPdf}
        />

        <div className="flex flex-wrap gap-2">
          {HUB_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setHubTab(tab.id);
                if (tab.id === 'activity' && !ACTIVITY_SECTIONS.some((s) => s.id === section)) {
                  setSection('incoming');
                }
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider ${
                hubTab === tab.id
                  ? 'bg-[#F89C28] text-white'
                  : 'bg-[#F1F5F9] text-[#6B7280] hover:bg-[#E5E7EB]'
              }`}
            >
              {tab.label}
              {tab.id === 'issues' && summary?.issues ? ` · ${summary.issues.count}` : ''}
            </button>
          ))}
        </div>

        {hubTab === 'activity' && summary && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {ACTIVITY_SECTIONS.map((s) => (
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

        {hubTab === 'issues' && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#9CA3AF]">
              {summary?.issues?.count || 0} issue{(summary?.issues?.count || 0) === 1 ? '' : 's'} this month
            </p>
            <FilterPills options={ISSUE_STATUSES} value={issueStatus} onChange={setIssueStatus} />
            <FilterPills options={ISSUE_TYPES} value={issueType} onChange={setIssueType} />
          </div>
        )}

        {(hubTab === 'activity' || hubTab === 'issues') && (
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={hubTab === 'issues' ? 'Search remarks or tracking...' : 'Search dispatch ID or tracking...'}
              className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] py-3 pl-12 pr-4 text-sm text-[#1F2937] outline-none transition focus:border-[#F89C28] focus:ring-2 focus:ring-[#F89C28]/15"
            />
          </div>
        )}
      </div>

      <div className="px-6 py-5">
        {hubTab === 'inventory' ? (
          inventoryLoading ? (
            <p className="py-12 text-center text-[#6B7280]">Loading inventory…</p>
          ) : inventory.length === 0 ? (
            <p className="py-12 text-center text-[#6B7280]">No on-hand school inventory.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#E5E7EB] bg-[#F89C28]/5">
                    {['Kit', 'On hand'].map((col) => (
                      <th key={col} className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[#F89C28]">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {inventory.map((row) => (
                    <tr key={row._id}>
                      <td className="px-5 py-4 font-bold text-[#1F2937]">{row.kit?.name || '—'}</td>
                      <td className="px-5 py-4 tabular-nums">{row.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : hubTab === 'audit' ? (
          auditsLoading ? (
            <p className="py-12 text-center text-[#6B7280]">Loading audits…</p>
          ) : (
            <AuditHistoryList audits={audits} emptyMessage="No audit reports for this school." />
          )
        ) : (
          <>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-[#9CA3AF]">
              {hubTab === 'issues' ? 'Issues' : activeSection.label}
            </p>
            <p className="mb-4 text-sm text-[#6B7280]">
              {hubTab === 'issues'
                ? 'Lost, mismatch, damaged, and not received live here as issue types — not as equal top-level lists.'
                : activeSection.hint}
            </p>
            {loading ? (
              <p className="py-12 text-center text-[#6B7280]">Loading…</p>
            ) : kind === 'dispatches' ? (
              <DispatchTable
                rows={rows}
                section={section}
                onView={setTrackingDispatch}
                onEditTracking={setEditTrackingDispatch}
                onDownloadInvoice={async (dispatch) => {
                  if (!dispatch?._id) return;
                  try {
                    await downloadDispatchInvoicePdf(api, `/admin/dispatches/${dispatch._id}/invoice`);
                    toast.success('Invoice PDF downloaded');
                  } catch (err) {
                    toast.error(err.response?.data?.message || 'Failed to download invoice PDF');
                  }
                }}
              />
            ) : (
              <IssueTable rows={rows} />
            )}
          </>
        )}
      </div>

      {(hubTab === 'activity' || hubTab === 'issues') && (
        <div className="border-t border-[#E5E7EB] bg-[#F8FAFC]/50 px-6 py-4">
          <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
        </div>
      )}

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
