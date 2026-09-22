import React, { useState } from 'react';
import { ArrowRight, Info, Minus, Package, Pencil, Plus, Shapes, Trash2, Upload, Warehouse } from 'lucide-react';
import toast from '../../utils/toast';
import api from '../../utils/api';
import Modal from '../ui/Modal';
import Pagination from '../shared/Pagination';
import { usePaginatedList } from '../../hooks/usePaginatedList';

const fieldClass = 'stitch-input px-3 placeholder:text-wk-muted';
const labelClass = 'stitch-label';

const emptyKitForm = { id: null, name: '', type: '', kitId: '', description: '', warehouseQuantity: 0 };

const AdminKitManager = ({ onRefresh }) => {
  const kitsList = usePaginatedList('/admin/kits', { enabled: true, limit: 20 });
  const kits = kitsList.items;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [kitForm, setKitForm] = useState(emptyKitForm);
  const [uploading, setUploading] = useState(false);

  const openKitModal = (kit = null) => {
    if (kit) {
      setKitForm({
        id: kit._id,
        name: kit.name,
        type: kit.type || '',
        kitId: kit.kitId,
        description: kit.description || '',
        warehouseQuantity: kit.warehouseQuantity ?? 0,
      });
    } else {
      setKitForm(emptyKitForm);
    }
    setIsModalOpen(true);
  };

  const handleSaveKit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: kitForm.name,
        type: kitForm.type,
        kitId: kitForm.kitId,
        description: kitForm.description,
        warehouseQuantity: kitForm.warehouseQuantity,
      };
      if (kitForm.id) {
        await api.put(`/admin/kits/${kitForm.id}`, payload);
        toast.success('Kit updated');
      } else {
        await api.post('/admin/kits', payload);
        toast.success('Kit added to warehouse');
      }
      setIsModalOpen(false);
      kitsList.refresh();
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save kit');
    }
  };

  const handleDeleteKit = async (id) => {
    if (!(await toast.confirm('Delete this kit from the catalog?'))) return;
    try {
      await api.delete(`/admin/kits/${id}`);
      toast.success('Kit deleted');
      kitsList.refresh();
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete kit');
    }
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    try {
      const res = await api.post('/admin/kits/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(res.data.message);
      if (res.data.errors?.length) {
        console.warn('Bulk upload errors:', res.data.errors);
        toast.error(`${res.data.errors.length} row(s) had errors — check console`);
      }
      kitsList.refresh();
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const totalStock = kits.reduce((sum, k) => sum + (k.warehouseQuantity || 0), 0);
  const kitTypes = [...new Set(kits.map((k) => k.type).filter(Boolean))].length;

  const stats = [
    {
      label: 'Warehouse Units',
      value: totalStock,
      hint: 'Total physical items in stock',
      Icon: Warehouse,
      iconClass: 'bg-wk-peach text-wk-orange-text',
    },
    {
      label: 'Kit SKUs',
      value: kitsList.total ?? kits.length,
      hint: 'Active stock-keeping units',
      Icon: Package,
      iconClass: 'bg-info-50 text-info-600',
    },
    {
      label: 'Kit Types',
      value: kitTypes,
      hint: 'Categorized assembly profiles',
      Icon: Shapes,
      iconClass: 'bg-success-100 text-success-700',
    },
  ];

  return (
    <>
      <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        {stats.map((stat) => {
          const { label, value, hint, Icon, iconClass } = stat;
          return (
          <div
            key={label}
            className="stitch-card group p-4"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${iconClass}`}>
              <Icon size={20} strokeWidth={1.75} />
            </div>
            <div className="mt-3">
              <p className="text-[13px] font-medium text-wk-body">{label}</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-wk-ink">{value}</p>
              <p className="mt-0.5 text-xs text-wk-muted">{hint}</p>
            </div>
          </div>
          );
        })}
      </section>

      <section className="stitch-card overflow-hidden">
        <div className="border-b border-wk-line p-4 md:p-5">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-lg font-semibold text-wk-ink">
                  Kit catalog
                </h2>
                <p className="text-[13px] text-wk-body">Global stock available to dispatch to schools.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer">
                <span className="wk-btn-secondary">
                  <Upload size={18} />
                  {uploading ? 'Uploading…' : 'Bulk Upload Excel'}
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="sr-only"
                  onChange={handleBulkUpload}
                  disabled={uploading}
                />
              </label>
              <button type="button" onClick={() => openKitModal()} className="wk-btn-primary">
                <Plus size={18} />
                Add Kit
              </button>
            </div>
          </div>

          <div className="relative mt-4 max-w-xl">
            <input
              type="search"
              value={kitsList.search}
              onChange={(e) => kitsList.setSearch(e.target.value)}
              placeholder="Filter by name, ID, or description..."
              aria-label="Filter kits by name, ID, or description"
              className="stitch-input rounded-xl px-3"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {kits.length > 0 ? (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-wk-line bg-wk-cream">
                  {['Kit ID', 'Name', 'Type', 'Warehouse Qty', 'Description', 'Actions'].map((col) => (
                    <th
                      key={col}
                      className={`sticky top-0 bg-wk-cream px-4 py-3 text-[13px] font-medium text-wk-body md:px-6 ${
                        col === 'Actions' ? 'text-right' : ''
                      } ${col === 'Description' ? 'hidden lg:table-cell' : ''}`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-wk-line">
                {kits.map((kit) => (
                  <tr
                    key={kit._id}
                    className={`transition hover:bg-wk-cream ${'bg-white'}`}
                  >
                    <td className="px-4 py-4 md:px-6">
                      <code className="rounded-md bg-wk-mist px-2 py-1 font-mono text-xs font-medium text-wk-ink">
                        {kit.kitId}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-wk-ink md:px-6">{kit.name}</td>
                    <td className="px-4 py-4 md:px-6">
                      {kit.type ? (
                        <span className="wk-badge bg-wk-peach text-wk-orange-text">
                          {kit.type}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-4 md:px-6">
                      <span className={`text-sm font-semibold tabular-nums ${(kit.warehouseQuantity ?? 0) === 0 ? 'text-error-600' : 'text-wk-ink'}`}>
                        {kit.warehouseQuantity ?? 0}
                      </span>
                    </td>
                    <td className="hidden max-w-xs truncate px-4 py-4 text-sm text-wk-muted lg:table-cell md:px-6">
                      {kit.description || '—'}
                    </td>
                    <td className="px-4 py-4 text-right md:px-6">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openKitModal(kit)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-wk-orange-text transition hover:bg-wk-peach"
                          aria-label="Edit kit"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteKit(kit._id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-error-600 transition hover:bg-error-50"
                          aria-label="Delete kit"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="inv-empty m-4">
              <Package size={24} aria-hidden />
              <p className="inv-empty__title">No kits in the warehouse</p>
              <p className="inv-empty__text">Add kits or bulk upload them via Excel.</p>
            </div>
          )}
        </div>

        <div className="border-t border-wk-line bg-white px-4 py-3 md:px-6">
          <Pagination
            page={kitsList.page}
            totalPages={kitsList.totalPages}
            total={kitsList.total}
            onPageChange={kitsList.setPage}
          />
        </div>
      </section>

      <section className="mt-6 flex items-start gap-4 rounded-2xl bg-info-50 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-info-600">
          <Info size={20} aria-hidden />
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold text-info-900">Bulk upload format</h3>
          <p className="text-sm text-info-800">
            To ensure successful data ingestion, your Excel spreadsheet columns must strictly match
            the following header sequence:{' '}
            <span className="rounded-md bg-white px-1.5 py-0.5 font-mono text-xs font-medium text-info-900">
              name, type, kitId, warehouseQuantity, description (optional)
            </span>
            .
          </p>
        </div>
      </section>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={kitForm.id ? 'Edit Kit' : 'Add Kit'}
        className="max-w-[640px]"
        bodyClassName="!p-6 md:!p-8 space-y-6"
        footer={
          <button
            type="submit"
            form="kit-form"
            className="wk-btn-primary group h-14 w-full text-base"
          >
            <span className="relative z-10">{kitForm.id ? 'Save Changes' : 'Add to Warehouse'}</span>
            <ArrowRight size={20} className="relative z-10 transition-transform group-hover:translate-x-1" />
          </button>
        }
      >
        <form id="kit-form" onSubmit={handleSaveKit} className="space-y-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className={labelClass}>Kit Name</label>
              <input
                className={fieldClass}
                value={kitForm.name}
                onChange={(e) => setKitForm({ ...kitForm, name: e.target.value })}
                placeholder="Enter kit name"
                required
              />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Kit Type</label>
              <input
                className={fieldClass}
                value={kitForm.type}
                onChange={(e) => setKitForm({ ...kitForm, type: e.target.value })}
                placeholder="e.g. Robotics"
                required
              />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Kit ID (SKU)</label>
              <input
                className={fieldClass}
                value={kitForm.kitId}
                onChange={(e) => setKitForm({ ...kitForm, kitId: e.target.value })}
                placeholder="SKU-XXXXX"
                required
              />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Warehouse Quantity</label>
              <div className="flex h-12 items-center overflow-hidden rounded-xl border border-wk-control bg-white focus-within:border-wk-orange-text focus-within:ring-1 focus-within:ring-wk-orange-text">
                <button
                  type="button"
                  className="flex h-full items-center border-r border-wk-line px-4 text-wk-muted transition hover:text-wk-orange-text"
                  onClick={() =>
                    setKitForm({
                      ...kitForm,
                      warehouseQuantity: Math.max(0, Number(kitForm.warehouseQuantity || 0) - 1),
                    })
                  }
                  aria-label="Decrease quantity"
                >
                  <Minus size={18} />
                </button>
                <input
                  type="number"
                  min="0"
                  className="h-full flex-1 border-none bg-transparent text-center text-sm font-bold text-wk-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={kitForm.warehouseQuantity}
                  onChange={(e) => setKitForm({ ...kitForm, warehouseQuantity: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="flex h-full items-center border-l border-wk-line px-4 text-wk-muted transition hover:text-wk-orange-text"
                  onClick={() =>
                    setKitForm({
                      ...kitForm,
                      warehouseQuantity: Number(kitForm.warehouseQuantity || 0) + 1,
                    })
                  }
                  aria-label="Increase quantity"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Description</label>
            <textarea
              className={`${fieldClass} h-auto min-h-[112px] resize-none py-3`}
              rows={4}
              value={kitForm.description}
              onChange={(e) => setKitForm({ ...kitForm, description: e.target.value })}
              placeholder="Provide a detailed description of the kit components and intended usage..."
            />
          </div>
        </form>
      </Modal>
    </>
  );
};

export default AdminKitManager;
