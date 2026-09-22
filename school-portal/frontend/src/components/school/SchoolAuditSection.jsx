import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@inventory/utils/api';
import toast from '@inventory/utils/toast';
import Button from '@inventory/components/ui/Button';
import Badge from '@inventory/components/ui/Badge';
import Input from '@inventory/components/ui/Input';
import Modal from '@inventory/components/ui/Modal';
import AuditReportDetails from '@inventory/components/AuditReportDetails';
import AuditHistoryList from '@inventory/components/shared/AuditHistoryList';
import { formatAuditMonthLabel } from '@inventory/utils/auditMonth';

function workflowBadgeType(status) {
  if (status === 'Approved') return 'success';
  if (status === 'Rejected') return 'error';
  if (status === 'Pending Admin Approval') return 'pending';
  return 'warning';
}

function parseNonNegativeInteger(raw, max) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits === '') return 0;
  let value = parseInt(digits, 10);
  if (Number.isNaN(value)) return 0;
  if (max != null) value = Math.min(value, max);
  return Math.max(0, value);
}

function itemQtyTotal(item) {
  return item.availableQuantity + item.lostQuantity + item.damagedQuantity;
}

function itemQtyBalanced(item) {
  return itemQtyTotal(item) === item.warehouseQuantity;
}

function itemQtyMismatchMessage(item) {
  const total = itemQtyTotal(item);
  const warehouse = item.warehouseQuantity;
  if (total === warehouse) return null;
  if (total > warehouse) {
    return `Total reported (${total}) exceeds warehouse stock (${warehouse}).`;
  }
  const short = warehouse - total;
  return `Total reported (${total}) must equal warehouse stock (${warehouse}). Account for ${short} more unit(s) as available, lost, or damaged.`;
}

function buildAuditSubmitSummary(items) {
  let totalLost = 0;
  let totalDamaged = 0;
  const lines = items
    .map((item) => {
      totalLost += item.lostQuantity;
      totalDamaged += item.damagedQuantity;
      return { name: item.name, lost: item.lostQuantity, damaged: item.damagedQuantity };
    })
    .filter((line) => line.lost > 0 || line.damaged > 0);

  return { totalLost, totalDamaged, lines };
}

function IntegerQtyInput({ label, value, onChange, max, required, className = '' }) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      label={label}
      required={required}
      className={`integer-qty-input ${className}`}
      value={String(value ?? 0)}
      onChange={(e) => onChange(parseNonNegativeInteger(e.target.value, max))}
    />
  );
}

export default function SchoolAuditSection({ isAuditWindowOpen, auditWindowInfo }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(null);
  const [auditItems, setAuditItems] = useState([]);
  const [lostFiles, setLostFiles] = useState({});
  const [damagedFiles, setDamagedFiles] = useState({});
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyMonth, setHistoryMonth] = useState('all');
  const [confirmSummary, setConfirmSummary] = useState(null);

  const loadForm = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/school/audit/form');
      setFormData(res.data);
      if (!res.data.existingAudit) {
        setAuditItems(
          (res.data.kits || []).map((k) => ({
            kit: k.kit,
            name: k.name,
            warehouseQuantity: k.warehouseQuantity,
            availableQuantity: k.warehouseQuantity,
            lostQuantity: 0,
            damagedQuantity: 0,
          }))
        );
      }
    } catch (err) {
      console.error(err);
      const message = err.response?.data?.message
        || (err.response?.status === 404
          ? 'Audit API not found — rebuild backend and web containers, then hard-refresh the browser.'
          : 'Failed to load audit form');
      toast.error(message);
      setFormData({ kits: [], existingAudit: null, open: isAuditWindowOpen });
      setAuditItems([]);
    } finally {
      setLoading(false);
    }
  }, [isAuditWindowOpen]);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/school/audits');
      setHistory(res.data.audits || []);
    } catch (err) {
      console.error(err);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadForm();
    loadHistory();
  }, [loadForm, loadHistory]);

  const historyMonthOptions = useMemo(() => {
    const months = new Set(history.map((audit) => audit.month).filter(Boolean));
    return [...months].sort((a, b) => {
      const [ay, am] = a.split('-').map(Number);
      const [by, bm] = b.split('-').map(Number);
      if (ay !== by) return (by || 0) - (ay || 0);
      return (bm || 0) - (am || 0);
    });
  }, [history]);

  const filteredHistory = useMemo(() => {
    if (historyMonth === 'all') return history;
    return history.filter((audit) => {
      const [y, m] = String(audit.month || '').split('-').map(Number);
      const [fy, fm] = String(historyMonth).split('-').map(Number);
      return y === fy && m === fm;
    });
  }, [history, historyMonth]);

  const updateItemQty = (index, field, value) => {
    setAuditItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const validateItems = () => {
    for (const item of auditItems) {
      const mismatch = itemQtyMismatchMessage(item);
      if (mismatch) {
        return `${item.name}: ${mismatch}`;
      }
      if (item.lostQuantity > 0 && !lostFiles[item.kit]) {
        return `Upload photo or video evidence for lost kits — ${item.name}.`;
      }
      if (item.damagedQuantity > 0 && !damagedFiles[item.kit]) {
        return `Upload photo or video evidence for damaged kits — ${item.name}.`;
      }
    }
    return null;
  };

  const allItemsBalanced = useMemo(
    () => auditItems.length > 0 && auditItems.every(itemQtyBalanced),
    [auditItems],
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationError = validateItems();
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setConfirmSummary(buildAuditSubmitSummary(auditItems));
  };

  const submitAudit = async () => {
    if (!formData?.month) return;
    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('month', formData.month);
      payload.append('items', JSON.stringify(auditItems.map((item) => ({
        kit: item.kit,
        name: item.name,
        availableQuantity: item.availableQuantity,
        lostQuantity: item.lostQuantity,
        damagedQuantity: item.damagedQuantity,
      }))));

      auditItems.forEach((item, index) => {
        if (lostFiles[item.kit]) payload.append(`lostEvidence_${index}`, lostFiles[item.kit]);
        if (damagedFiles[item.kit]) payload.append(`damagedEvidence_${index}`, damagedFiles[item.kit]);
      });

      await api.post('/school/audit', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setConfirmSummary(null);
      toast.success('Audit submitted for review. Lost/damaged items are listed under Replacements.');
      await Promise.all([loadForm(), loadHistory()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Audit submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  let currentSection;
  if (loading) {
    currentSection = (
      <section className="stitch-card-pad">
        <p className="text-wk-muted">Loading audit form…</p>
      </section>
    );
  } else if (formData?.existingAudit) {
    const audit = formData.existingAudit;
    const note =
      audit.assumedIntact ? 'Official audit dates ended with no submission. All kits are recorded as intact and exact.'
      : audit.workflowStatus === 'Pending AM Approval' ? 'Your audit has been submitted and is under review.'
        : audit.workflowStatus === 'Pending Admin Approval' ? 'Your audit is still under review.'
          : audit.workflowStatus === 'Approved' ? 'Audit approved. Lost/damaged replacements will be dispatched.'
            : audit.workflowStatus === 'Rejected' ? 'This audit was rejected. Contact support if you need help.'
              : null;
    currentSection = (
      <section className="stitch-card overflow-hidden">
        <div className="space-y-4 border-b border-wk-line bg-white p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <h2 className="text-lg font-semibold text-wk-ink">
              Monthly Audit — {formatAuditMonthLabel(audit.month)}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge type={workflowBadgeType(audit.workflowStatus)}>
                {audit.workflowStatus === 'Pending AM Approval' || audit.workflowStatus === 'Pending Admin Approval'
                  ? 'Needs Review'
                  : audit.workflowStatus}
              </Badge>
              <Badge type={audit.status === 'Mismatch' ? 'error' : 'success'}>{audit.status}</Badge>
              <span className="ml-1 self-center text-sm text-wk-muted">
                Month: {formatAuditMonthLabel(audit.month)}
              </span>
            </div>
          </div>
          {note && (
            <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-wk-muted">
              <span className="font-medium text-blue-800">Note:</span> {note}
            </p>
          )}
        </div>
        <div className="p-0">
          <AuditReportDetails audit={audit} showWorkflow />
        </div>
      </section>
    );
  } else if (!isAuditWindowOpen) {
    const scheduledMonth = auditWindowInfo?.window?.auditMonth || auditWindowInfo?.month;
    currentSection = (
      <section className="stitch-card-pad">
        <h2 className="mb-4 text-lg font-semibold text-wk-ink">Monthly Audit</h2>
        <div className="rounded-2xl border border-error-100 bg-error-50 p-8 text-center">
          <h3 className="mb-2 text-xl font-bold text-error-800">Audit Window Closed</h3>
          <p className="font-medium text-error-600">
            {auditWindowInfo?.window
              ? `Audits for ${formatAuditMonthLabel(scheduledMonth) || 'this month'} can only be submitted between ${new Date(auditWindowInfo.window.startDate).toLocaleDateString()} and ${new Date(auditWindowInfo.window.endDate).toLocaleDateString()}.`
              : 'No audit window has been scheduled for your division this month.'}
          </p>
        </div>
      </section>
    );
  } else {
    currentSection = (
      <section className="stitch-card overflow-hidden">
        <div className="border-b border-wk-line bg-white px-6 py-5">
          <h2 className="text-lg font-semibold text-wk-ink">
            Monthly Audit — {formatAuditMonthLabel(formData?.month)}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-800">
              Type whole numbers only for each kit. Available + lost + damaged must equal warehouse quantity exactly.
              Photo/video evidence is required for any lost or damaged units.
            </p>
            <p className="text-sm text-blue-700">
              Lost and damaged quantities automatically trigger replacement dispatches after AM review and Admin approval — this is mandatory and cannot be skipped.
            </p>
          </div>

          {auditItems.length === 0 ? (
            <p className="inv-empty inv-empty__text">No kits in warehouse to audit.</p>
          ) : (
            auditItems.map((item, index) => {
              const total = itemQtyTotal(item);
              const balanced = itemQtyBalanced(item);
              const mismatchMsg = itemQtyMismatchMessage(item);
              return (
                <div key={item.kit} className="space-y-4 rounded-xl border border-wk-line bg-slate-50/50 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-wk-line pb-3">
                    <span className="font-bold text-wk-ink">{item.name}</span>
                    <Badge type="info">Warehouse: {item.warehouseQuantity} units</Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <IntegerQtyInput
                      label="Available Qty"
                      required
                      max={item.warehouseQuantity}
                      value={item.availableQuantity}
                      onChange={(value) => updateItemQty(index, 'availableQuantity', value)}
                    />
                    <IntegerQtyInput
                      label="Lost Qty"
                      required
                      value={item.lostQuantity}
                      onChange={(value) => updateItemQty(index, 'lostQuantity', value)}
                    />
                    <IntegerQtyInput
                      label="Damaged Qty"
                      required
                      value={item.damagedQuantity}
                      onChange={(value) => updateItemQty(index, 'damagedQuantity', value)}
                    />
                  </div>
                  <p className={`text-xs font-semibold ${balanced ? 'text-success-700' : 'text-error-600'}`}>
                    Reported: {total} / {item.warehouseQuantity} units
                    {balanced ? ' — balanced' : ''}
                  </p>
                  {mismatchMsg && (
                    <p className="text-xs font-semibold text-error-600">
                      {mismatchMsg}
                    </p>
                  )}
                  {item.lostQuantity > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="stitch-label">
                        Lost kit evidence (photo/video) *
                      </label>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        className="text-sm"
                        onChange={(e) => setLostFiles((prev) => ({ ...prev, [item.kit]: e.target.files?.[0] || null }))}
                        required
                      />
                    </div>
                  )}
                  {item.damagedQuantity > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="stitch-label">
                        Damaged kit evidence (photo/video) *
                      </label>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        className="text-sm"
                        onChange={(e) => setDamagedFiles((prev) => ({ ...prev, [item.kit]: e.target.files?.[0] || null }))}
                        required
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {auditItems.length > 0 && (
            <>
              {!allItemsBalanced && (
                <p className="text-sm font-semibold text-error-600">
                  Fix quantity totals for all kits before submitting. Each kit must account for every unit in warehouse stock.
                </p>
              )}
              <Button
                variant="gradient"
                type="submit"
                className="w-full px-8 sm:w-auto"
                disabled={submitting || !allItemsBalanced}
              >
                {submitting ? 'Submitting…' : 'Submit Official Audit'}
              </Button>
            </>
          )}
        </form>
      </section>
    );
  }

  const hasReplacements = confirmSummary
    && (confirmSummary.totalLost > 0 || confirmSummary.totalDamaged > 0);

  return (
    <div className="space-y-6">
      {currentSection}

      <Modal
        isOpen={!!confirmSummary}
        onClose={() => !submitting && setConfirmSummary(null)}
        title="Confirm audit submission"
        className="max-w-lg"
      >
        {confirmSummary && (
          <div className="space-y-4">
            {hasReplacements ? (
              <>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Lost and damaged kits will go through Account Manager review, then Admin approval, before replacement dispatch.
                </p>
                <ul className="text-sm text-slate-800 space-y-1.5 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  {confirmSummary.lines.map((line) => (
                    <li key={line.name}>
                      <span className="font-semibold">{line.name}:</span>
                      {line.lost > 0 && ` ${line.lost} lost`}
                      {line.lost > 0 && line.damaged > 0 && ','}
                      {line.damaged > 0 && ` ${line.damaged} damaged`}
                    </li>
                  ))}
                  <li className="pt-2 border-t border-slate-200 font-bold text-brand-primary">
                    Total — {confirmSummary.totalLost} lost, {confirmSummary.totalDamaged} damaged
                  </li>
                </ul>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Replacement handling cannot be skipped. These items appear on your Replacements page after submission.
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-600 leading-relaxed">
                No lost or damaged units reported. Your counts will be sent for Account Manager review, then Admin approval.
              </p>
            )}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
              <Button
                variant="outline"
                type="button"
                disabled={submitting}
                onClick={() => setConfirmSummary(null)}
              >
                Cancel
              </Button>
              <Button
                variant="gradient"
                type="button"
                disabled={submitting}
                onClick={submitAudit}
              >
                {submitting ? 'Submitting…' : 'Submit audit'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <section className="stitch-card-pad">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-semibold text-wk-ink">Audit history</h2>
            <p className="mt-1 text-sm text-wk-muted">
              View audits submitted in previous months, including status and kit details.
            </p>
          </div>
          <div className="flex w-full min-w-[200px] flex-col gap-1 md:w-64">
            <label className="stitch-label" htmlFor="school-audit-history-month">Filter by month</label>
            <select
              id="school-audit-history-month"
              className="stitch-input"
              value={historyMonth}
              onChange={(e) => setHistoryMonth(e.target.value)}
            >
              <option value="all">All months</option>
              {historyMonthOptions.map((month) => (
                <option key={month} value={month}>{formatAuditMonthLabel(month)}</option>
              ))}
            </select>
          </div>
        </div>
        {historyLoading ? (
          <p className="inv-empty inv-empty__text">Loading audit history…</p>
        ) : (
          <AuditHistoryList
            audits={filteredHistory}
            emptyMessage="No previous audits submitted yet."
            variant="school"
          />
        )}
      </section>
    </div>
  );
}
