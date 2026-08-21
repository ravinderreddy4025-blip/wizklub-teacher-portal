import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import api from '@inventory/utils/api';
import toast from '@inventory/utils/toast';
import Badge from '@inventory/components/ui/Badge';
import SkeletonLoader from '@inventory/components/ui/SkeletonLoader';
import PageHeader from '@inventory/components/layout/PageHeader';
import DispatchReceiptModal from '../components/school/DispatchReceiptModal';
import DispatchTrackingModal from '@inventory/components/shared/DispatchTrackingModal';
import SchoolDispatchHub from '../components/school/SchoolDispatchHub';
import SchoolOperationsKpis from '../components/school/SchoolOperationsKpis';
import SchoolAuditSection from '../components/school/SchoolAuditSection';
import { ROUTES } from '@school-portal/routes/constants';
import { canAcknowledgeDispatch, canEditSchoolReceipt, canUpgradeNotReceivedReport } from '@inventory/utils/schoolDispatch';

const SchoolDashboard = () => {
  const location = useLocation();
  const activeView = useMemo(() => {
    const path = location.pathname;
    if (path.includes('/warehouse')) return 'warehouse';
    if (path.includes('/audit')) return 'audit';
    if (path.includes('/replacements') || path.includes('/replacement')) return 'replacement';
    if (
      path === ROUTES.school.root
      || path === `${ROUTES.school.root}/`
      || path === ROUTES.school.dispatches
      || path.startsWith(`${ROUTES.school.dispatches}/`)
    ) return 'dispatches';
    return 'invalid';
  }, [location.pathname]);

  const [hubRefreshKey, setHubRefreshKey] = useState(0);
  const [warehouse, setWarehouse] = useState([]);
  const [receiptDispatch, setReceiptDispatch] = useState(null);
  const [detailsDispatch, setDetailsDispatch] = useState(null);
  const [receiptSubmitting, setReceiptSubmitting] = useState(false);

  const [replacementHistory, setReplacementHistory] = useState([]);
  const [replacementSummary, setReplacementSummary] = useState(null);
  const [replacementLoading, setReplacementLoading] = useState(false);
  
  const [isAuditWindowOpen, setIsAuditWindowOpen] = useState(false);
  const [auditWindowInfo, setAuditWindowInfo] = useState(null);
  const [warehouseMonth, setWarehouseMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    fetchDispatches();
    fetchWarehouse();
    checkAuditWindow();
  }, []);

  useEffect(() => {
    if (activeView === 'replacement') {
      fetchReplacementHistory();
    }
    if (activeView === 'warehouse') {
      fetchWarehouse();
    }
  }, [activeView]);

  const bumpHubRefresh = () => setHubRefreshKey((k) => k + 1);

  const fetchDispatches = async () => {
    try {
      const res = await api.get('/school/dispatches');
      return res.data;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const fetchWarehouse = async () => {
    try {
      const res = await api.get('/school/warehouse');
      setWarehouse(res.data.inventory || []);
    } catch (err) {
      console.error(err);
    }
  };

  const checkAuditWindow = async () => {
    try {
      const res = await api.get('/school/audit/window');
      setIsAuditWindowOpen(res.data.open);
      setAuditWindowInfo(res.data);
    } catch (err) {
      console.error(err);
      setIsAuditWindowOpen(false);
      setAuditWindowInfo(null);
    }
  };

  const submitReceipt = async (payload) => {
    if (!receiptDispatch?.items?.length) return;
    if (!payload) return;

    setReceiptSubmitting(true);
    try {
      const targets = payload.items || receiptDispatch.items;
      const primary = targets[0];

      if (payload.replaceReceipt) {
        await api.post(`/school/dispatch/${primary._id}/reset-receipt`);
      }

      for (let i = 0; i < targets.length; i += 1) {
        const item = targets[i];
        const formData = new FormData();
        formData.append('receiptType', payload.receiptType);
        formData.append('receiverName', payload.receiverName);
        formData.append('receivedDate', payload.receivedDate);
        formData.append('quantityReceived', payload.receiptType === 'all_received' ? item.quantity : 0);
        formData.append('lostQuantity', 0);
        formData.append('damagedQuantity', 0);
        formData.append('suppressNotification', 'true');
        if (payload.receiptNotes) formData.append('receiptNotes', payload.receiptNotes);
        if (payload.deliveryPhoto && i === 0) formData.append('deliveryPhoto', payload.deliveryPhoto);

        await api.put(`/school/dispatch/${item._id}/confirm`, formData);
      }

      await api.post('/school/receipt/notify', {
        receiptCategory: payload.receiptType === 'all_received' ? 'all_received' : 'not_received',
        dispatchIds: targets.map((t) => t._id),
        receiverName: payload.receiverName,
        receivedDate: payload.receivedDate,
        receiptNotes: payload.receiptNotes || '',
      });

      toast.success(
        payload.replaceReceipt
          ? 'Acknowledgment updated'
          : payload.receiptType === 'all_received'
            ? 'Delivery completed — receipt acknowledged'
            : 'Shipment marked as not received'
      );
      setReceiptDispatch(null);
      fetchDispatches();
      bumpHubRefresh();
      fetchWarehouse();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to confirm receipt');
    } finally {
      setReceiptSubmitting(false);
    }
  };

  const submitReportIssues = async (payload, validationError) => {
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (!payload) return;

    setReceiptSubmitting(true);
    try {
      const dispatchId = payload.rows[0]?.dispatchId;

      if (payload.replaceReceipt && dispatchId) {
        const freshDispatches = await fetchDispatches();
        const latest = (freshDispatches || []).find((d) => String(d._id) === String(dispatchId));
        if (!latest || !canEditSchoolReceipt(latest)) {
          toast.error('This acknowledgment can no longer be edited.');
          setReceiptDispatch(null);
          return;
        }
        await api.post(`/school/dispatch/${dispatchId}/reset-receipt`);
      } else if (!payload.isEdit) {
        const freshDispatches = await fetchDispatches();
        const awaitingAck = new Set(
          (freshDispatches || [])
            .filter((d) => canAcknowledgeDispatch(d) || canUpgradeNotReceivedReport(d))
            .map((d) => String(d._id)),
        );

        const staleRows = payload.rows.filter((row) => !awaitingAck.has(String(row.dispatchId)));
        if (staleRows.length > 0) {
          toast.error('This shipment was already acknowledged or is under review. Your dispatch list has been refreshed.');
          setReceiptDispatch(null);
          return;
        }
      } else {
        const freshDispatches = await fetchDispatches();
        const editable = new Set(
          (freshDispatches || [])
            .filter((d) => canEditSchoolReceipt(d))
            .map((d) => String(d._id)),
        );
        if (!editable.has(String(dispatchId))) {
          toast.error('This acknowledgment can no longer be edited.');
          setReceiptDispatch(null);
          return;
        }
      }

      const formData = new FormData();
      formData.append('receiverName', payload.receiverName);
      formData.append('receivedDate', payload.receivedDate);
      if (payload.receiptNotes) formData.append('receiptNotes', payload.receiptNotes);
      if (payload.isEdit && !payload.replaceReceipt) formData.append('isEdit', 'true');

      const itemsJson = payload.rows.map((row, index) => {
        if (row.photos?.length) {
          row.photos.forEach((file, photoIndex) => {
            formData.append(`item_${index}_photo_${photoIndex}`, file);
          });
        }
        if (row.video) formData.append(`item_${index}_video`, row.video);

        return {
          dispatchId: row.dispatchId,
          quantityReceived: Number(row.quantityReceived),
          issueType: row.issueType,
          damageDescription: row.damageDescription,
          severity: row.severity,
          remarks: row.remarks,
        };
      });

      formData.append('items', JSON.stringify(itemsJson));

      await api.post('/school/receipt/report-issues', formData);

      const isNotReceived = payload.rows?.[0]?.issueType === 'Shipment Not Received';
      toast.success(
        payload.replaceReceipt || payload.isEdit
          ? 'Acknowledgment updated'
          : isNotReceived
            ? 'Not received reported — pending AM approval'
            : 'Issue report submitted — pending AM approval',
      );
      setReceiptDispatch(null);
      fetchDispatches();
      bumpHubRefresh();
      fetchWarehouse();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to submit issue report';
      toast.error(message);
      if (
        message.includes('not awaiting acknowledgment')
        || message.includes('already has a reported issue')
        || message.includes('already marked')
      ) {
        setReceiptDispatch(null);
        fetchDispatches();
        bumpHubRefresh();
      }
    } finally {
      setReceiptSubmitting(false);
    }
  };

  const openReceiptModal = async (item, { edit = false } = {}) => {
    const freshDispatches = await fetchDispatches();
    const latest = (freshDispatches || []).find((d) => String(d._id) === String(item._id));

    if (edit) {
      if (!latest || !canEditSchoolReceipt(latest)) {
        toast.error('This acknowledgment can no longer be edited.');
        return;
      }
      setReceiptDispatch({ items: [latest], consignmentNo: latest.consignmentNo, editMode: true });
      return;
    }

    const canAck = latest ? canAcknowledgeDispatch(latest) : false;
    const canUpgrade = latest ? canUpgradeNotReceivedReport(latest) : false;
    if (!latest || (!canAck && !canUpgrade)) {
      toast.error('This dispatch was already acknowledged or is under review.');
      return;
    }

    setReceiptDispatch({ items: [latest], consignmentNo: latest.consignmentNo });
  };

  const fetchReplacementHistory = async () => {
    try {
      setReplacementLoading(true);
      const res = await api.get('/school/replacements/history');
      setReplacementSummary(res.data.replacementSummary);
      setReplacementHistory(res.data.replacements);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load replacement history');
    } finally {
      setReplacementLoading(false);
    }
  };

  if (activeView === 'invalid') {
    return <Navigate to={ROUTES.school.dispatches} replace />;
  }

  if (location.pathname === ROUTES.school.root || location.pathname === `${ROUTES.school.root}/`) {
    return <Navigate to={ROUTES.school.dispatches} replace />;
  }

  const warehouseRows = warehouse.filter((row) => (row.quantity || 0) > 0);

  const headerCopy = {
    dispatches: { title: 'Dispatches', subtitle: 'Browse incoming and completed shipments by month. Acknowledge receipt or review reported issues.' },
    warehouse: {
      title: 'School Warehouse',
      subtitle: (
        <>
          Kit stock at your school after confirmed dispatches.{' '}
          <span className="font-semibold text-[var(--stitch-primary)]">Real-time inventory tracking.</span>
        </>
      ),
    },
    audit: { title: 'Monthly Audit', subtitle: 'Verify inventory counts for all assigned kits to maintain system accuracy.' },
    replacement: { title: 'Replacements', subtitle: 'Replacement kits in progress and history. This month’s replacement total is on Dispatches — not a separate KPI card.' },
  }[activeView];

  return (
    <div className="animate-fade-in duration-500">
      <PageHeader title={headerCopy.title} subtitle={headerCopy.subtitle} />

      {activeView === 'dispatches' && (
        <SchoolDispatchHub
          refreshKey={hubRefreshKey}
          onOpenReceipt={openReceiptModal}
          onOpenTrack={setDetailsDispatch}
        />
      )}

      {activeView === 'warehouse' && (
        <section className="stitch-card overflow-hidden">
          <div className="space-y-4 border-b border-[var(--stitch-border)] p-6">
            <div className="flex flex-col gap-1">
              <label className="stitch-label" htmlFor="school-warehouse-month">Report month</label>
              <input
                id="school-warehouse-month"
                type="month"
                className="stitch-input max-w-[180px]"
                value={warehouseMonth}
                onChange={(e) => setWarehouseMonth(e.target.value)}
              />
            </div>
            <SchoolOperationsKpis month={warehouseMonth} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="stitch-table-head">
                <tr>
                  <th>Kit</th>
                  <th>Kit ID</th>
                  <th>Stock On Hand</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--stitch-border)]">
                {warehouseRows.map((row) => (
                  <tr key={row._id} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--stitch-primary)]" aria-hidden />
                        <span className="font-semibold text-[var(--stitch-text)]">{row.kit?.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-[var(--stitch-muted)]">{row.kit?.kitId || '—'}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-[var(--stitch-text)]">
                        {row.quantity} {row.quantity === 1 ? 'Unit' : 'Units'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-[var(--stitch-muted)]">
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
                {warehouseRows.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-5 py-12 text-center italic text-[var(--stitch-muted)]">
                      No stock yet. Confirm incoming dispatches to add kits to your warehouse.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between border-t border-[var(--stitch-border)] bg-slate-50/50 px-6 py-4">
            <p className="text-xs text-[var(--stitch-muted)]">
              Showing {warehouseRows.length} of {warehouseRows.length} {warehouseRows.length === 1 ? 'entry' : 'entries'}
            </p>
          </footer>
        </section>
      )}

      <DispatchReceiptModal
        consignment={receiptDispatch}
        isOpen={!!receiptDispatch?.items?.length}
        onClose={() => !receiptSubmitting && setReceiptDispatch(null)}
        onSubmit={submitReceipt}
        onReportIssues={submitReportIssues}
        submitting={receiptSubmitting}
      />

      <DispatchTrackingModal
        dispatch={detailsDispatch}
        isOpen={!!detailsDispatch}
        onClose={() => setDetailsDispatch(null)}
      />

      {activeView === 'audit' && (
        <SchoolAuditSection
          isAuditWindowOpen={isAuditWindowOpen}
          auditWindowInfo={auditWindowInfo}
        />
      )}

      {activeView === 'replacement' && (
        <section className="stitch-card-pad space-y-8">
          <h2 className="text-lg font-semibold text-[var(--stitch-text)]">Replacement History</h2>

          {replacementLoading ? (
            <div className="py-6">
              <SkeletonLoader className="mb-4 h-10 w-64" />
              <SkeletonLoader className="h-96" />
            </div>
          ) : (
            <>
              <div className="stitch-banner border-l-[var(--stitch-primary)] bg-[#FFF7ED] p-4">
                <div className="flex gap-3">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-[var(--stitch-primary)]" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm leading-relaxed text-orange-800">
                    Replacement requests are raised automatically when you submit your monthly audit with lost or damaged quantities.{' '}
                    <span className="font-medium">Manual requests are not available</span>
                    {' '}— use the Monthly Audit page during the audit window.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="flex flex-col space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-6">
                  <span className="stitch-label">Lost Summary</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-[var(--stitch-text)]">
                      {replacementSummary?.['Lost Dispatch']?.count ?? 0}
                    </span>
                    <span className="text-sm font-medium text-[var(--stitch-muted)]">
                      Total Qty: {replacementSummary?.['Lost Dispatch']?.totalQuantity ?? 0}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-6">
                  <span className="stitch-label">Damaged Summary</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-[var(--stitch-text)]">
                      {replacementSummary?.['Damaged Dispatch']?.count ?? 0}
                    </span>
                    <span className="text-sm font-medium text-[var(--stitch-muted)]">
                      Total Qty: {replacementSummary?.['Damaged Dispatch']?.totalQuantity ?? 0}
                    </span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-full border-collapse text-left text-sm">
                  <thead className="stitch-table-head">
                    <tr>
                      <th>Type</th>
                      <th>Reference</th>
                      <th>Audit Month</th>
                      <th>Kit</th>
                      <th>Quantity</th>
                      <th>Status</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {replacementHistory.length === 0 && (
                      <tr>
                        <td colSpan="7" className="px-5 py-10 text-center font-medium text-[var(--stitch-muted)]">
                          No audit replacements yet. Submit your monthly audit to report lost or damaged kits.
                        </td>
                      </tr>
                    )}
                    {replacementHistory.map((r) => (
                      <tr key={r._id} className="transition-colors hover:bg-gray-50/50">
                        <td className="px-4 py-4 whitespace-nowrap">
                          <Badge type={r.type === 'Lost' ? 'pending' : 'error'}>
                            {r.type}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-700">
                          {r.replacementId || '—'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                          {r.auditMonth || '—'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {r.kit?.name}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                          x{r.quantity}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <Badge type={
                            r.status === 'Dispatched' ? 'success'
                              : r.status === 'Rejected' ? 'error'
                                : r.status === 'Waiting for Replacement' || r.status === 'Awaiting dispatch' ? 'info'
                                  : 'pending'
                          }>
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(r.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
};

export default SchoolDashboard;
