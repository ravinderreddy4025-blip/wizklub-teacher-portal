import React, { useState } from 'react';
import { ArrowRight, Minus, Package, Pencil, Plus, Shapes, Trash2, Upload, Warehouse } from 'lucide-react';
import toast from '../../utils/toast';
import api from '../../utils/api';
import Modal from '../ui/Modal';
import Pagination from '../shared/Pagination';
import { usePaginatedList } from '../../hooks/usePaginatedList';

const fieldClass = 'stitch-input px-3 placeholder:text-[#9CA3AF]';
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
      iconClass: 'bg-[#F89C28]/10 text-[#F89C28] group-hover:bg-[#F89C28] group-hover:text-white',
    },
    {
      label: 'Kit SKUs',
      value: kitsList.total ?? kits.length,
      hint: 'Active stock-keeping units',
      Icon: Package,
      iconClass: 'bg-[#3B82F6]/10 text-[#3B82F6] group-hover:bg-[#3B82F6] group-hover:text-white',
    },
    {
      label: 'Kit Types',
      value: kitTypes,
      hint: 'Categorized assembly profiles',
      Icon: Shapes,
      iconClass: 'bg-[#22C55E]/10 text-[#22C55E] group-hover:bg-[#22C55E] group-hover:text-white',
    },
  ];

  return (
    <>
      <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        {stats.map(({ label, value, hint, Icon, iconClass }) => (
          <div
            key={label}
            className="stitch-card group p-4 transition hover:-translate-y-0.5"
            style={{ boxShadow: 'var(--stitch-shadow-soft)' }}
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${iconClass}`}>
              <Icon size={20} strokeWidth={1.75} />
            </div>
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280]/60">{label}</p>
              <p className="mt-0.5 font-heading text-xl font-extrabold text-[#1F2937]">{value}</p>
              <p className="mt-0.5 text-[11px] text-[#6B7280]">{hint}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="stitch-card overflow-hidden" style={{ borderRadius: '16px' }}>
        <div className="border-b border-[var(--stitch-border)] p-4 md:p-5">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div className="flex items-center gap-4">
              <div className="h-10 w-1.5 rounded-full bg-[var(--stitch-primary)]" />
              <div>
                <p className="font-heading text-base font-bold text-[var(--stitch-text)] md:text-lg">
                  Kit catalog
                </p>
                <p className="text-[13px] text-[var(--stitch-muted)]">Global stock available to dispatch to schools.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer">
                <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--stitch-border)] bg-white px-5 py-2.5 text-sm font-bold text-[var(--stitch-text)] transition hover:bg-[var(--stitch-canvas)]">
                  <Upload size={18} />
                  {uploading ? 'Uploading…' : 'Bulk Upload Excel'}
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleBulkUpload}
                  disabled={uploading}
                />
              </label>
              <button type="button" onClick={() => openKitModal()} className="stitch-btn-primary px-6">
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
                <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
                  {['Kit ID', 'Name', 'Type', 'Warehouse Qty', 'Description', 'Actions'].map((col) => (
                    <th
                      key={col}
                      className={`px-4 py-4 text-xs font-bold uppercase tracking-wider text-[#6B7280] md:px-6 ${
                        col === 'Actions' ? 'text-right' : ''
                      } ${col === 'Description' ? 'hidden lg:table-cell' : ''}`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {kits.map((kit, index) => (
                  <tr
                    key={kit._id}
                    className={`transition hover:bg-[#F8FAFC] ${index % 2 === 1 ? 'bg-[#F8FAFC]/40' : 'bg-white'}`}
                  >
                    <td className="px-4 py-4 md:px-6">
                      <code className="rounded bg-[#F1F5F9] px-2 py-1 text-xs font-bold font-mono text-[#1F2937]">
                        {kit.kitId}
                      </code>
                    </td>
                    <td className="px-4 py-4 font-bold text-[#1F2937] md:px-6">{kit.name}</td>
                    <td className="px-4 py-4 md:px-6">
                      {kit.type ? (
                        <span className="rounded-full bg-[#F89C28]/10 px-3 py-1 text-[12px] font-bold text-[#F89C28]">
                          {kit.type}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-4 md:px-6">
                      <span className="inline-flex items-center justify-center rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-1.5 text-sm font-bold text-[#F89C28]">
                        {kit.warehouseQuantity ?? 0}
                      </span>
                    </td>
                    <td className="hidden max-w-xs truncate px-4 py-4 text-sm text-[#6B7280] lg:table-cell md:px-6">
                      {kit.description || '—'}
                    </td>
                    <td className="px-4 py-4 text-right md:px-6">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openKitModal(kit)}
                          className="rounded-lg p-2 text-[#F89C28] transition hover:bg-[#F89C28] hover:text-white"
                          aria-label="Edit kit"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteKit(kit._id)}
                          className="rounded-lg p-2 text-[#EF4444] transition hover:bg-[#EF4444] hover:text-white"
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
            <p className="py-16 text-center text-[#6B7280]">
              No kits in warehouse. Add kits or bulk upload via Excel.
            </p>
          )}
        </div>

        <div className="border-t border-[#E5E7EB] bg-[#F8FAFC]/50 px-6 py-4 md:px-8">
          <Pagination
            page={kitsList.page}
            totalPages={kitsList.totalPages}
            total={kitsList.total}
            onPageChange={kitsList.setPage}
          />
        </div>
      </section>

      <section className="mt-6 flex items-start gap-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <span className="text-sm font-bold">i</span>
        </div>
        <div>
          <h4 className="mb-1 text-sm font-bold text-blue-900">Bulk Upload Formatting</h4>
          <p className="text-sm text-blue-700/90">
            To ensure successful data ingestion, your Excel spreadsheet columns must strictly match
            the following header sequence:{' '}
            <span className="rounded bg-blue-100/50 px-1.5 py-0.5 font-mono text-xs font-bold text-blue-900">
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
        className="max-w-[640px] rounded-[16px]"
        bodyClassName="!p-6 md:!p-8 space-y-6"
        footer={
          <button
            type="submit"
            form="kit-form"
            className="group relative flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#FBB040] via-[#F89C28] to-[#F15A24] text-base font-bold text-white shadow-[0_8px_24px_rgba(248,156,40,0.35)] transition hover:brightness-105 active:scale-[0.98]"
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
              <div className="flex h-12 items-center overflow-hidden rounded-lg border border-[#E5E7EB] bg-[#F8FAFC]">
                <button
                  type="button"
                  className="flex h-full items-center border-r border-[#E5E7EB] px-4 text-[#6B7280] transition hover:text-[#F89C28]"
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
                  className="h-full flex-1 border-none bg-transparent text-center text-sm font-bold text-[#1F2937] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={kitForm.warehouseQuantity}
                  onChange={(e) => setKitForm({ ...kitForm, warehouseQuantity: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="flex h-full items-center border-l border-[#E5E7EB] px-4 text-[#6B7280] transition hover:text-[#F89C28]"
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
