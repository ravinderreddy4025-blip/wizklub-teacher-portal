import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { CheckCircle2, History } from 'lucide-react';
import api from '../utils/api';
import toast from '../utils/toast';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';
import SkeletonLoader from '../components/ui/SkeletonLoader';
import PageHeader from '../components/layout/PageHeader';
import { ROUTES } from '../utils/routes';
import { formatSchoolDisplayName } from '../utils/schoolName';

const DispatchDashboard = () => {
  const location = useLocation();
  const activeView = useMemo(() => {
    const path = location.pathname;
    if (path.includes('/history')) return 'history';
    if (path === ROUTES.dispatch.pending || path === `${ROUTES.dispatch.pending}/`) return 'pending';
    return 'invalid';
  }, [location.pathname]);

  const [dispatches, setDispatches] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trackingByDispatch, setTrackingByDispatch] = useState({});

  const fetchDispatches = async () => {
    try {
      const res = await api.get('/dispatch/pending'); 
      setDispatches(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dispatches');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await api.get('/dispatch/history');
      setHistory(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dispatch history');
    }
  };

  useEffect(() => {
    if (activeView === 'pending') fetchDispatches();
    if (activeView === 'history') fetchHistory();
  }, [activeView]);

  const handleDispatch = async (id) => {
    try {
      const trackingId = (trackingByDispatch[id] || '').trim();
      await api.put(`/dispatch/${id}/status`, { status: 'Dispatched', trackingId });
      toast.success('Kit marked as Dispatched!');
      setDispatches(dispatches.filter(d => d._id !== id));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleEditKitId = async (dispatchKey, currentKitId) => {
    const next = prompt('Enter new Kit ID:', currentKitId || '');
    if (next === null) return;
    try {
      await api.put(`/dispatch/${dispatchKey}/kitId`, { kitId: next });
      toast.success('Kit ID updated');
      if (activeView === 'pending') fetchDispatches();
      if (activeView === 'history') fetchHistory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update Kit ID');
    }
  };

  if (activeView === 'invalid') {
    return <Navigate to={ROUTES.dispatch.pending} replace />;
  }

  const headerCopy = {
    pending: { title: 'Pending Shipments', subtitle: 'Enter tracking IDs and mark shipments as dispatched.' },
    history: { title: 'Dispatch History', subtitle: 'Review all dispatches processed by the warehouse.' },
  }[activeView];

  if (loading && activeView === 'pending') return (
    <div className="space-y-6">
      <SkeletonLoader className="w-64 h-10 mb-8" />
      <SkeletonLoader className="h-96" />
    </div>
  );

  return (
    <div className="animate-fade-in duration-500">
      <PageHeader title={headerCopy.title} subtitle={headerCopy.subtitle} />
      
      <Card noPadding>
        {activeView === 'pending' && dispatches.length === 0 && (
          <div className="inv-empty m-4 !py-12">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-100 text-success-700">
              <CheckCircle2 size={28} aria-hidden />
            </span>
            <h3 className="inv-empty__title">All tasks complete</h3>
            <p className="inv-empty__text">No pending dispatches to process at this time.</p>
          </div>
        )}

        {activeView === 'pending' && dispatches.length > 0 && (
          <div className="overflow-x-auto">
            <table className="clean-table">
              <thead>
                <tr>
                  <th>Kit Details</th>
                  <th>Quantity</th>
                  <th>Destination School</th>
                  <th>Dispatch ID</th>
                  <th>Replacement ID</th>
                  <th>Category</th>
                  <th>Kit ID</th>
                  <th>Tracking ID</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {dispatches.map(item => (
                  <tr key={item._id}>
                    <td>
                      <p className="font-medium text-wk-ink">{item.kit?.name}</p>
                      <div className="mt-1 space-y-1">
                        <div className="text-xs text-wk-body">
                          Kit ID: {item.kitId || '—'}
                        </div>
                        <button
                          type="button"
                          className="inv-auth-link !min-h-[28px] !text-[13px]"
                          onClick={() => handleEditKitId(item.dispatchId || item._id, item.kitId)}
                        >
                          Edit Kit ID
                        </button>
                      </div>
                    </td>
                    <td className="whitespace-nowrap font-medium text-wk-ink">x{item.quantity}</td>
                    <td className="font-semibold text-slate-700">{formatSchoolDisplayName(item.school?.name)}</td>
                    <td className="whitespace-nowrap font-mono text-xs text-wk-body">{item.dispatchId || item._id}</td>
                    <td className="whitespace-nowrap font-mono text-xs text-wk-body">{item.replacementId || '—'}</td>
                    <td className="whitespace-nowrap">{item.category || 'New Dispatch'}</td>
                    <td className="whitespace-nowrap font-mono text-xs text-wk-body">{item.kitId || '—'}</td>
                    <td className="min-w-56">
                      <Input
                        value={trackingByDispatch[item._id] ?? ''}
                        onChange={(e) => setTrackingByDispatch(prev => ({ ...prev, [item._id]: e.target.value }))}
                        placeholder="Enter tracking ID"
                      />
                    </td>
                    <td className="text-right">
                      <Button variant="gradient" className="whitespace-nowrap px-4 text-[13px]" onClick={() => handleDispatch(item._id)}>
                        Mark Dispatched
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeView === 'history' && history.length === 0 && (
          <div className="inv-empty m-4 !py-12">
            <History size={28} aria-hidden />
            <h3 className="inv-empty__title">No dispatch history yet</h3>
            <p className="inv-empty__text">Once dispatches are created, they’ll appear here.</p>
          </div>
        )}

        {activeView === 'history' && history.length > 0 && (
          <div className="overflow-x-auto">
            <table className="clean-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>School</th>
                  <th>Kit</th>
                  <th>Kit ID</th>
                  <th>Category</th>
                  <th>Dispatch ID</th>
                  <th>Replacement ID</th>
                  <th>Tracking ID</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map(item => (
                  <tr key={item._id}>
                    <td className="whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="font-medium">{formatSchoolDisplayName(item.school?.name)}</td>
                    <td className="min-w-[10rem]">{item.kit?.name}</td>
                    <td className="whitespace-nowrap font-mono text-xs text-wk-body">{item.kitId || '—'}</td>
                    <td className="whitespace-nowrap">{item.category || 'New Dispatch'}</td>
                    <td className="whitespace-nowrap font-mono text-xs text-wk-body">{item.dispatchId || item._id}</td>
                    <td className="whitespace-nowrap font-mono text-xs text-wk-body">{item.replacementId || '—'}</td>
                    <td className="whitespace-nowrap font-mono text-xs text-wk-body">{item.trackingId || '—'}</td>
                    <td>
                      <Badge type={item.status === 'Delivery Completed' || item.status === 'Received' || item.status === 'Completed' ? 'success' : item.status === 'Pending' ? 'pending' : item.status === 'Dispatched' ? 'info' : 'error'}>
                        {item.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default DispatchDashboard;
