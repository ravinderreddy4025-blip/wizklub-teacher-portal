import React, { useEffect, useState, useCallback } from 'react';
import { Package, History, AlertCircle } from 'lucide-react';
import api from '@inventory/utils/api';
import Button from '@inventory/components/ui/Button';
import Badge from '@inventory/components/ui/Badge';
import Pagination from '@inventory/components/shared/Pagination';
import { DispatchIdCell, KitDetailsCell, QuantityCell, IssueShipmentDetailsCell } from '@inventory/components/shared/DispatchRedispatchCells';
import { canAcknowledgeDispatch, canEditSchoolReceipt, canUpgradeNotReceivedReport } from '@inventory/utils/schoolDispatch';
import SchoolOperationsKpis from './SchoolOperationsKpis';
import toast from '@inventory/utils/toast';
import { downloadDispatchInvoicePdf } from '@inventory/utils/downloadPdfBlob';
import {
  schoolIssueStatusLabel,
  schoolIssueStatusBadge,
  schoolIssueTypeLabel,
  SCHOOL_ISSUE_STATUS_FILTERS,
  SCHOOL_ISSUE_TYPE_FILTERS,
} from '@inventory/utils/schoolIssueStatus';

const ACTIVITY_SECTIONS = [
  { id: 'incoming', label: 'Incoming', subtitle: 'In transit or awaiting your acknowledgment', icon: Package },
  { id: 'past', label: 'Completed', subtitle: 'Responded with at least one OK kit', icon: History },
  { id: 'history', label: 'History', subtitle: 'Every dispatch this month, including Not Received', icon: History },
];

export function defaultDispatchMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function dispatchStatusBadge(status, receiptIssue) {
  if (receiptIssue?.status === 'Pending AM Approval') return 'warning';
  if (receiptIssue?.status === 'Pending Admin Approval') return 'pending';
  if (status === 'Delivery Completed' || status === 'Received' || status === 'Completed') return 'success';
  if (['missing_dispatch', 'damaged_dispatch', 'mismatch_dispatch', 'not_received_dispatch'].includes(status)) return 'warning';
  if (['Damage Under Review', 'Missing Item Under Review', 'Received with Issues'].includes(status)) return 'warning';
  if (status === 'Replacement Pending') return 'pending';
  if (status === 'Not Received') return 'error';
  if (status === 'Dispatched') return 'info';
  return 'pending';
}

function formatDispatchStatus(item) {
  const issue = item.receiptIssue;
  if (issue?.status) {
    const label = schoolIssueStatusLabel(issue.status);
    if (item.status === 'Completed' || item.status === 'Dispatched') {
      if (issue.status === 'Approved' && item.status === 'Dispatched') return 'Waiting for Replacement';
      if (item.status === 'Completed') return Number(item.outstandingQuantity) > 0 ? `Cycle completed · ${label}` : 'Fulfilled';
    }
  }
  const labels = {
    missing_dispatch: 'Completed',
    damaged_dispatch: 'Completed',
    mismatch_dispatch: 'Completed',
    not_received_dispatch: 'Not Received',
  };
  if (item.status === 'Completed') {
    return Number(item.outstandingQuantity) > 0 ? 'Cycle completed' : 'Fulfilled';
  }
  if (labels[item.status]) return labels[item.status];
  if (item.status === 'Dispatched') return 'Dispatched';
  return item.status;
}

function SummaryTile({ section, summary, active, onClick }) {
  const Icon = section.icon;
  const stats = summary?.[section.id] || { count: 0, units: 0 };
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'lumina-dispatch-tile text-left w-full rounded-xl border p-4 transition-all duration-200',
        section.accent,
        active
          ? 'border-2 border-[var(--stitch-primary)] bg-[#fffaf5] shadow-md'
          : 'border-[var(--stitch-border)] bg-white hover:shadow-md',
      ].filter(Boolean).join(' ')}
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            active ? 'bg-[var(--stitch-primary)]/10 text-[var(--stitch-primary)]' : 'bg-gray-100 text-[var(--stitch-muted)]'
          }`}
        >
          <Icon size={18} />
        </div>
        <div className="text-right">
      <p className="text-2xl font-bold text-[var(--stitch-text)]">
        {section.id === 'history' ? (stats.count || 0) : (stats.units || 0)}
      </p>
          <p className="text-[10px] font-bold uppercase text-[var(--stitch-muted)]">Units</p>
        </div>
      </div>
      <h3 className="text-sm font-semibold text-[var(--stitch-text)]">{section.label}</h3>
      <p className="mt-0.5 text-xs text-[var(--stitch-muted)]">
        {stats.count} record{stats.count === 1 ? '' : 's'}
      </p>
    </button>
  );
}

function SchoolDispatchActions({ item, onTrack, onAcknowledge, onEdit, onUpgrade, onDownloadInvoice }) {
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="outline"
        className="max-w-[140px] rounded-full px-4 py-1.5 text-xs font-semibold"
        onClick={() => onTrack(item)}
      >
        Track dispatch
      </Button>
      <Button
        variant="outline"
        className="max-w-[140px] rounded-full px-4 py-1.5 text-xs font-semibold"
        onClick={() => onDownloadInvoice(item)}
      >
        Invoice PDF
      </Button>
      {canAcknowledgeDispatch(item) && (
        <Button
          variant="gradient"
          className="max-w-[140px] rounded-full px-4 py-1.5 text-xs font-semibold shadow-sm"
          onClick={() => onAcknowledge(item)}
        >
          Acknowledge receipt
        </Button>
      )}
      {canEditSchoolReceipt(item) && (
        <Button
          variant="outline"
          className="max-w-[140px] rounded-full px-4 py-1.5 text-xs font-semibold"
          onClick={() => onEdit(item)}
        >
          Edit acknowledgment
        </Button>
      )}
      {(item.status === 'Delivery Completed' || item.status === 'Received' || item.status === 'Damage Under Review' || item.status === 'Missing Item Under Review' || item.status === 'Received with Issues' || item.status === 'Replacement Pending') && (
        <div className="text-right text-xs text-slate-600">
          <p className="font-semibold text-success-700">
            {item.status === 'Delivery Completed' ? 'Delivery completed' : item.status === 'Received with Issues' ? 'Received with issues' : `Received: ${item.quantityReceived ?? item.quantity}`}
          </p>
          {item.receiverName && <p className="mt-1">By: {item.receiverName}</p>}
          {item.receivedAt && (
            <p className="mt-0.5">{new Date(item.receivedAt).toLocaleDateString()}</p>
          )}
          {(item.lostOnReceipt > 0 || item.damagedOnReceipt > 0) && (
            <p className="mt-1 text-warning-700">
              {item.lostOnReceipt > 0 && `${item.lostOnReceipt} lost`}
              {item.lostOnReceipt > 0 && item.damagedOnReceipt > 0 && ' · '}
              {item.damagedOnReceipt > 0 && `${item.damagedOnReceipt} damaged`}
            </p>
          )}
        </div>
      )}
      {canUpgradeNotReceivedReport(item) && (
        <Button
          variant="outline"
          className="max-w-[160px] rounded-full px-4 py-1.5 text-xs font-semibold"
          onClick={() => onUpgrade(item)}
        >
          Complete not-received report
        </Button>
      )}
      {item.status === 'not_received_dispatch' && item.receiptIssue?.status && (
        <p className="text-[10px] font-semibold text-error-600">Not received — {schoolIssueStatusLabel(item.receiptIssue.status)}</p>
      )}
      {item.status === 'Pending' && (
        <span className="text-xs font-medium italic text-slate-400">Awaiting shipment</span>
      )}
    </div>
  );
}

function DispatchTable({ rows, onTrack, onAcknowledge, onEdit, onUpgrade, onDownloadInvoice }) {
  if (!rows.length) {
    return <p className="py-12 text-center text-[var(--stitch-muted)]">No dispatches in this section for the selected month.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-[var(--stitch-border)] text-left">
        <thead className="stitch-table-head">
          <tr>
            <th>Dispatch ID</th>
            <th>Kit Details</th>
            <th>Quantity</th>
            <th>Status</th>
            <th className="text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--stitch-border)] bg-white">
          {rows.map((item) => (
            <tr key={item._id} className="transition-colors hover:bg-gray-50">
              <td className="px-5 py-5">
                <DispatchIdCell item={item} onViewHistory={() => onTrack(item)} />
              </td>
              <td className="px-5 py-5"><KitDetailsCell item={item} showShippedDate={false} /></td>
              <td className="px-5 py-5"><QuantityCell item={item} /></td>
              <td className="px-5 py-5">
                <Badge type={dispatchStatusBadge(item.status, item.receiptIssue)}>
                  {formatDispatchStatus(item)}
                </Badge>
                {item.receiptIssue?.status && (
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">
                    {schoolIssueStatusLabel(item.receiptIssue.status)}
                    {item.receiptIssue.issueType === 'Shipment Not Received' ? ' · Not Received' : ''}
                    {item.receiptIssue.issueType === 'Missing Product' ? ' · Lost' : ''}
                  </p>
                )}
              </td>
              <td className="px-5 py-5 text-right">
                <SchoolDispatchActions
                  item={item}
                  onTrack={onTrack}
                  onAcknowledge={onAcknowledge}
                  onEdit={onEdit}
                  onUpgrade={onUpgrade}
                  onDownloadInvoice={onDownloadInvoice}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function issueBadgeType(issueType) {
  if (issueType === 'Damaged Product' || issueType === 'Shipment Not Received') return 'error';
  if (issueType === 'Quantity Mismatch') return 'info';
  return 'warning';
}

function IssueTable({ rows }) {
  if (!rows.length) {
    return <p className="py-12 text-center text-[var(--stitch-muted)]">No issues reported in this section for the selected month.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-[var(--stitch-border)] text-left">
        <thead className="stitch-table-head">
          <tr>
            <th>Source</th>
            <th>Kit</th>
            <th>Issue</th>
            <th>Units affected</th>
            <th>Dispatch / ref</th>
            <th>Status</th>
            <th>Reported</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--stitch-border)] bg-white">
          {rows.map((row) => {
            if (row.recordType === 'replacement_request') {
              const req = row.item;
              return (
                <tr key={`req-${req._id}`} className="transition-colors hover:bg-gray-50">
                  <td className="px-5 py-4"><Badge type="pending">{req.type === 'Damaged' ? 'Damaged kit request' : 'Lost kit request'}</Badge></td>
                  <td className="px-5 py-4 font-bold text-slate-900">{req.kit?.name || '—'}</td>
                  <td className="px-5 py-4"><Badge type="warning">{req.type}</Badge></td>
                  <td className="px-5 py-4 font-bold">{req.quantity}</td>
                  <td className="px-5 py-4 font-mono text-xs">{req.replacementId || '—'}</td>
                  <td className="px-5 py-4"><Badge type={schoolIssueStatusBadge(req.status)}>{schoolIssueStatusLabel(req.status)}</Badge></td>
                  <td className="px-5 py-4">{new Date(req.createdAt).toLocaleDateString()}</td>
                </tr>
              );
            }
            const issue = row.item;
            return (
              <tr key={`issue-${issue._id}`} className="transition-colors hover:bg-gray-50">
                <td className="px-5 py-4"><Badge type="info">Receipt report</Badge></td>
                <td className="px-5 py-4 font-bold text-slate-900">{issue.kit?.name || '—'}</td>
                  <td className="px-5 py-4"><Badge type={issueBadgeType(issue.issueType)}>{schoolIssueTypeLabel(issue.issueType)}</Badge></td>
                <td className="px-5 py-4 font-bold">{issue.quantityAffected}</td>
                <td className="px-5 py-4">
                  <p className="font-mono text-xs">{issue.sourceDispatchRef || issue.dispatch?.dispatchId || '—'}</p>
                  <IssueShipmentDetailsCell issue={issue} />
                </td>
                <td className="px-5 py-4"><Badge type={schoolIssueStatusBadge(issue.status)}>{schoolIssueStatusLabel(issue.status)}</Badge></td>
                <td className="px-5 py-4">{new Date(issue.receivedAt || issue.createdAt).toLocaleDateString()}</td>
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

export default function SchoolDispatchHub({
  refreshKey = 0,
  onOpenReceipt,
  onOpenTrack,
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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [month, section, hubTab, issueType, issueStatus, debouncedSearch]);

  const fetchHub = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/school/dispatch-hub', {
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
  }, [month, section, page, debouncedSearch, refreshKey, hubTab, issueType, issueStatus]);

  useEffect(() => {
    fetchHub();
  }, [fetchHub]);

  const activeSection = ACTIVITY_SECTIONS.find((s) => s.id === section) || ACTIVITY_SECTIONS[0];

  return (
    <section className="stitch-card overflow-hidden">
      <div className="space-y-8 border-b border-[var(--stitch-border)] bg-[var(--stitch-canvas)]/50 p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="stitch-label" htmlFor="school-dispatch-month">Month</label>
            <input
              id="school-dispatch-month"
              type="month"
              className="stitch-input min-w-[160px]"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        </div>

        <SchoolOperationsKpis month={month} />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setHubTab('activity')}
            className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider ${
              hubTab === 'activity' ? 'bg-[#F89C28] text-white' : 'bg-[#F1F5F9] text-[#6B7280]'
            }`}
          >
            Dispatch activity
          </button>
          <button
            type="button"
            onClick={() => setHubTab('issues')}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider ${
              hubTab === 'issues' ? 'bg-[#F89C28] text-white' : 'bg-[#F1F5F9] text-[#6B7280]'
            }`}
          >
            <AlertCircle size={12} />
            Issues{summary?.issues ? ` · ${summary.issues.count}` : ''}
          </button>
        </div>

        {hubTab === 'activity' && summary && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              Not Received and Lost are different — filter by type
            </p>
            <FilterPills options={SCHOOL_ISSUE_STATUS_FILTERS} value={issueStatus} onChange={setIssueStatus} />
            <FilterPills options={SCHOOL_ISSUE_TYPE_FILTERS} value={issueType} onChange={setIssueType} />
          </div>
        )}
      </div>

      {(hubTab === 'activity' || hubTab === 'issues') && (
        <div className="border-b border-[var(--stitch-border)] bg-white p-6">
          <div className="relative max-w-md">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <svg className="h-5 w-5 text-[var(--stitch-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="search"
              className="stitch-input w-full pl-10"
              placeholder={hubTab === 'issues' ? 'Search remarks or tracking...' : 'Search dispatch ID or tracking...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="bg-gray-50 px-6 py-4">
        <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--stitch-primary)]">
          {hubTab === 'issues' ? 'Issues' : activeSection.label}
        </h4>
        <p className="mt-0.5 text-xs text-[var(--stitch-muted)]">
          {hubTab === 'issues'
            ? 'Lost, mismatch, damaged, and not received live here as issue types.'
            : activeSection.subtitle}
        </p>
      </div>

      <div className="bg-white">
        {loading ? (
          <p className="py-12 text-center text-[var(--stitch-muted)]">Loading…</p>
        ) : kind === 'dispatches' ? (
          <DispatchTable
            rows={rows}
            onTrack={onOpenTrack}
            onAcknowledge={onOpenReceipt}
            onEdit={(item) => onOpenReceipt(item, { edit: true })}
            onUpgrade={onOpenReceipt}
            onDownloadInvoice={async (item) => {
              if (!item?._id) return;
              try {
                await downloadDispatchInvoicePdf(api, `/school/dispatches/${item._id}/invoice`);
                toast.success('Invoice PDF downloaded');
              } catch (err) {
                toast.error(err.response?.data?.message || 'Failed to download invoice PDF');
              }
            }}
          />
        ) : (
          <IssueTable rows={rows} />
        )}
      </div>

      <div className="border-t border-[var(--stitch-border)] px-6 py-5">
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      </div>
    </section>
  );
}
