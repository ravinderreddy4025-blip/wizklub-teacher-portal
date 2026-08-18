import React, { useEffect, useState, useCallback } from 'react';
import { Package, History, PackageX, Scale, ShieldAlert } from 'lucide-react';
import api from '@inventory/utils/api';
import Button from '@inventory/components/ui/Button';
import Badge from '@inventory/components/ui/Badge';
import Pagination from '@inventory/components/shared/Pagination';
import { DispatchIdCell, KitDetailsCell, QuantityCell, IssueShipmentDetailsCell } from '@inventory/components/shared/DispatchRedispatchCells';
import { canAcknowledgeDispatch, canEditSchoolReceipt, canUpgradeNotReceivedReport } from '@inventory/utils/schoolDispatch';
import SchoolOperationsKpis from './SchoolOperationsKpis';

const SECTIONS = [
  { id: 'incoming', label: 'Incoming', subtitle: 'In transit or awaiting your acknowledgment', icon: Package, accent: '', activeAccent: true },
  { id: 'past', label: 'Completed', subtitle: 'Completed or closed shipments', icon: History, accent: '' },
  { id: 'lost', label: 'Lost / not received', subtitle: 'Devices reported missing', icon: PackageX, accent: '' },
  { id: 'mismatch', label: 'Mismatch', subtitle: 'Quantity does not match', icon: Scale, accent: 'border-t-4 border-t-yellow-400' },
  { id: 'damaged', label: 'Damaged', subtitle: 'Devices reported damaged', icon: ShieldAlert, accent: 'border-t-4 border-t-purple-500' },
];

export function defaultDispatchMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function dispatchStatusBadge(status, receiptIssue) {
  if (receiptIssue?.status === 'Pending AM Approval') return 'warning';
  if (receiptIssue?.status === 'Pending Admin Approval') return 'pending';
  if (status === 'Delivery Completed' || status === 'Received') return 'success';
  if (['missing_dispatch', 'damaged_dispatch', 'mismatch_dispatch', 'not_received_dispatch'].includes(status)) return 'warning';
  if (['Damage Under Review', 'Missing Item Under Review', 'Received with Issues'].includes(status)) return 'warning';
  if (status === 'Replacement Pending') return 'pending';
  if (status === 'Not Received') return 'error';
  if (status === 'Dispatched') return 'info';
  return 'pending';
}

function formatDispatchStatus(item) {
  const issue = item.receiptIssue;
  if (issue?.status === 'Pending AM Approval') return 'AM Review';
  if (issue?.status === 'Pending Admin Approval') return 'Admin Review';
  if (issue?.status === 'Clarification Requested') return 'Clarification Needed';
  const labels = {
    missing_dispatch: 'Missing Dispatch',
    damaged_dispatch: 'Damaged Dispatch',
    mismatch_dispatch: 'Mismatch Dispatch',
    not_received_dispatch: 'Not Received',
  };
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
          <p className="text-2xl font-bold text-[var(--stitch-text)]">{stats.units}</p>
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

function SchoolDispatchActions({ item, onTrack, onAcknowledge, onEdit, onUpgrade }) {
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="outline"
        className="max-w-[140px] rounded-full px-4 py-1.5 text-xs font-semibold"
        onClick={() => onTrack(item)}
      >
        Track dispatch
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
      {item.status === 'not_received_dispatch' && item.receiptIssue?.status === 'Pending AM Approval' && (
        <p className="text-[10px] font-semibold text-error-600">Not received — AM review</p>
      )}
      {item.status === 'Pending' && (
        <span className="text-xs font-medium italic text-slate-400">Awaiting shipment</span>
      )}
    </div>
  );
}

function DispatchTable({ rows, onTrack, onAcknowledge, onEdit, onUpgrade }) {
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
                {['missing_dispatch', 'damaged_dispatch', 'mismatch_dispatch', 'not_received_dispatch', 'Received with Issues'].includes(item.status)
                  && item.receiptIssue?.status === 'Pending AM Approval' && (
                  <p className="mt-1 text-[10px] font-semibold text-warning-700">Awaiting AM review</p>
                )}
                {['missing_dispatch', 'damaged_dispatch', 'mismatch_dispatch', 'not_received_dispatch'].includes(item.status)
                  && item.receiptIssue?.status === 'Pending Admin Approval' && (
                  <p className="mt-1 text-[10px] text-slate-500">AM approved — with admin</p>
                )}
                {item.receiptIssue?.status === 'Approved'
                  && ['missing_dispatch', 'damaged_dispatch', 'mismatch_dispatch', 'not_received_dispatch'].includes(item.status) && (
                  <p className="mt-1 text-[10px] text-slate-500">Replacement sent — acknowledge when received</p>
                )}
              </td>
              <td className="px-5 py-5 text-right">
                <SchoolDispatchActions
                  item={item}
                  onTrack={onTrack}
                  onAcknowledge={onAcknowledge}
                  onEdit={onEdit}
                  onUpgrade={onUpgrade}
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
                  <td className="px-5 py-4"><Badge type="info">{req.status}</Badge></td>
                  <td className="px-5 py-4">{new Date(req.createdAt).toLocaleDateString()}</td>
                </tr>
              );
            }
            const issue = row.item;
            return (
              <tr key={`issue-${issue._id}`} className="transition-colors hover:bg-gray-50">
                <td className="px-5 py-4"><Badge type="info">Receipt report</Badge></td>
                <td className="px-5 py-4 font-bold text-slate-900">{issue.kit?.name || '—'}</td>
                <td className="px-5 py-4"><Badge type={issueBadgeType(issue.issueType)}>{issue.issueType}</Badge></td>
                <td className="px-5 py-4 font-bold">{issue.quantityAffected}</td>
                <td className="px-5 py-4">
                  <p className="font-mono text-xs">{issue.sourceDispatchRef || issue.dispatch?.dispatchId || '—'}</p>
                  <IssueShipmentDetailsCell issue={issue} />
                </td>
                <td className="px-5 py-4"><Badge type="warning">{issue.status}</Badge></td>
                <td className="px-5 py-4">{new Date(issue.receivedAt || issue.createdAt).toLocaleDateString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SchoolDispatchHub({
  refreshKey = 0,
  onOpenReceipt,
  onOpenTrack,
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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [month, section, debouncedSearch]);

  const fetchHub = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/school/dispatch-hub', {
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
  }, [month, section, page, debouncedSearch, refreshKey]);

  useEffect(() => {
    fetchHub();
  }, [fetchHub]);

  const activeSection = SECTIONS.find((s) => s.id === section) || SECTIONS[0];

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
          <p className="pb-2 text-sm text-[var(--stitch-muted)]">
            Viewing <span className="font-semibold text-[var(--stitch-text)]">{activeSection.label}</span> for{' '}
            <span className="font-semibold text-[var(--stitch-text)]">{month}</span>
          </p>
        </div>

        <SchoolOperationsKpis month={month} />

        {summary && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
      </div>

      {(section === 'incoming' || section === 'past') && (
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
              placeholder="Search dispatch ID or tracking..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="bg-gray-50 px-6 py-4">
        <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--stitch-primary)]">
          {activeSection.label}
        </h4>
        <p className="mt-0.5 text-xs text-[var(--stitch-muted)]">{activeSection.subtitle}</p>
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
