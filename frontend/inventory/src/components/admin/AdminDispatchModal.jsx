import React, { useMemo, useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from '../../utils/toast';
import api from '../../utils/api';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import ComponentIdPreview from './ComponentIdPreview';
import { previewComponentId } from '../../utils/componentId';
import { formatSchoolDisplayName } from '../../utils/schoolName';

export const emptyDispatchKitLine = () => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  kitType: '',
  kit: '',
  quantity: 1,
});

export const emptyDispatchForm = () => ({
  divisionId: '',
  school: '',
  category: 'New Dispatch',
  consignmentNo: '',
  items: [emptyDispatchKitLine()],
});

export function findDuplicateKitTypeLine(items, currentKey, kitType) {
  if (!kitType) return null;
  const duplicateIndex = items.findIndex(
    (line) => line.key !== currentKey && line.kitType === kitType
  );
  return duplicateIndex === -1 ? null : duplicateIndex + 1;
}

export function hasDuplicateKitTypes(items) {
  const types = (items || []).map((line) => line.kitType).filter(Boolean);
  return types.length !== new Set(types).size;
}

const AdminDispatchModal = ({
  isOpen,
  onClose,
  divisions,
  kits,
  form,
  setForm,
  onSubmit,
  submitting = false,
}) => {
  const [divisionSchools, setDivisionSchools] = useState([]);

  useEffect(() => {
    if (!isOpen || !form.divisionId) {
      setDivisionSchools([]);
      return;
    }
    api.get('/admin/schools', { params: { divisionId: form.divisionId, limit: 50 } })
      .then((res) => setDivisionSchools(res.data.data || []))
      .catch(() => setDivisionSchools([]));
  }, [isOpen, form.divisionId]);

  const schoolsInDivision = divisionSchools;

  const kitTypes = useMemo(
    () => [...new Set(kits.map((k) => k.type).filter(Boolean))],
    [kits]
  );

  const selectedSchool = schoolsInDivision.find((s) => s._id === form.school) || null;
  const kitLines = form.items?.length ? form.items : [emptyDispatchKitLine()];

  const updateItem = (key, patch) => {
    setForm({
      ...form,
      items: kitLines.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    });
  };

  const handleKitTypeChange = (key, kitType) => {
    const duplicateLine = findDuplicateKitTypeLine(kitLines, key, kitType);
    if (duplicateLine !== null) {
      toast.error(
        `Kit type "${kitType}" is already added in Kit ${duplicateLine} above. Each kit type can only be added once in this dispatch.`
      );
      return;
    }
    updateItem(key, { kitType, kit: '' });
  };

  const addKitLine = () => {
    const usedTypes = new Set(kitLines.map((line) => line.kitType).filter(Boolean));
    const availableTypes = kitTypes.filter((t) => !usedTypes.has(t));
    if (availableTypes.length === 0 && kitTypes.length > 0) {
      toast.error('All kit types are already added. Remove a line to add a different kit type.');
      return;
    }
    setForm({ ...form, items: [...kitLines, emptyDispatchKitLine()] });
  };

  const removeKitLine = (key) => {
    if (kitLines.length <= 1) return;
    setForm({ ...form, items: kitLines.filter((item) => item.key !== key) });
  };

  const getKitsByType = (kitType) => {
    if (!kitType) return [];
    return kits.filter((k) => k.type === kitType);
  };

  const getStockWarning = (item) => {
    const kitDoc = kits.find((k) => k._id === item.kit);
    if (!kitDoc || !item.quantity) return null;
    if (Number(item.quantity) > (kitDoc.warehouseQuantity || 0)) {
      return `Exceeds warehouse stock (${kitDoc.warehouseQuantity || 0} available)`;
    }
    return null;
  };

  const getComponentIdPreview = (item, lineIndex) => {
    const kitDoc = kits.find((k) => k._id === item.kit);
    return previewComponentId(selectedSchool, kitDoc, item.quantity, lineIndex);
  };

  const hasStockIssue = kitLines.some((item) => getStockWarning(item));
  const duplicateKitTypes = hasDuplicateKitTypes(kitLines);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Dispatch" className="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-wk-body">Division</label>
            <select
              className="saas-input"
              value={form.divisionId}
              onChange={(e) =>
                setForm({ ...form, divisionId: e.target.value, school: '' })
              }
              required
            >
              <option value="">Select division</option>
              {divisions.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-wk-body">School</label>
            <select
              className="saas-input"
              value={form.school}
              onChange={(e) => setForm({ ...form, school: e.target.value })}
              required
              disabled={!form.divisionId}
            >
              <option value="">Select school</option>
              {schoolsInDivision.map((s) => (
                <option key={s._id} value={s._id}>
                  {formatSchoolDisplayName(s.name)} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium text-wk-body">Kits to dispatch</label>
            <Button
              type="button"
              variant="outline"
              className="text-xs py-1.5 px-3"
              onClick={addKitLine}
              disabled={kitTypes.length > 0 && kitLines.filter((l) => l.kitType).length >= kitTypes.length}
            >
              <Plus size={14} className="inline mr-1" />
              Add kit
            </Button>
          </div>

          {kitLines.map((item, index) => {
            const kitsByType = getKitsByType(item.kitType);
            const stockWarning = getStockWarning(item);
            const duplicateLine = findDuplicateKitTypeLine(kitLines, item.key, item.kitType);

            return (
              <div key={item.key} className="glass-card-frosted p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 normal-case tracking-normal">Kit {index + 1}</span>
                  {kitLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeKitLine(item.key)}
                      className="p-1.5 rounded-lg text-error-500 hover:bg-error-50 transition-colors"
                      aria-label="Remove kit line"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600 normal-case tracking-normal">Kit Type</label>
                    <select
                      className="saas-input"
                      value={item.kitType}
                      onChange={(e) => handleKitTypeChange(item.key, e.target.value)}
                      required
                    >
                      <option value="">Select type</option>
                      {kitTypes.map((t) => {
                        const usedInOtherLine = kitLines.some(
                          (line) => line.key !== item.key && line.kitType === t
                        );
                        if (usedInOtherLine && item.kitType !== t) return null;
                        return (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        );
                      })}
                    </select>
                    {duplicateLine !== null && (
                      <p className="text-xs text-error-600 font-semibold">
                        This kit type is already used in Kit {duplicateLine} above.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600 normal-case tracking-normal">Kit Name</label>
                    <select
                      className="saas-input"
                      value={item.kit}
                      onChange={(e) => updateItem(item.key, { kit: e.target.value })}
                      required
                      disabled={!item.kitType}
                    >
                      <option value="">Select kit</option>
                      {kitsByType.map((k) => (
                        <option key={k._id} value={k._id}>
                          {k.name} — stock: {k.warehouseQuantity ?? 0}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600 normal-case tracking-normal">Quantity</label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                      required
                    />
                    {stockWarning && (
                      <p className="text-xs text-error-600 font-semibold">{stockWarning}</p>
                    )}
                  </div>
                  <ComponentIdPreview value={getComponentIdPreview(item, index + 1)} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-wk-body">Category</label>
            <select className="saas-input" value={form.category} disabled>
              <option value="New Dispatch">New Dispatch</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-wk-body">
              Shipment Consignment No. <span className="normal-case font-medium text-slate-400">(optional)</span>
            </label>
            <Input
              placeholder="e.g. AWB-123456789"
              value={form.consignmentNo}
              onChange={(e) => setForm({ ...form, consignmentNo: e.target.value })}
            />
            <p className="text-xs text-slate-500">
              Optional now — add tracking within 24 hours after dispatch.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-wk-body">Dispatch proof photo (optional)</label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="saas-input file:mr-3 file:rounded-lg file:border-0 file:rounded-full file:bg-wk-peach file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-wk-navy"
            onChange={(e) => setForm({ ...form, proofPhoto: e.target.files?.[0] || null })}
          />
          <p className="text-xs text-slate-500">
            Snap a photo of the package as proof. Visible to the Account Manager and the school.
          </p>
        </div>

        <p className="text-xs text-slate-500 bg-brand-primary/5 border border-brand-primary/15 rounded-lg p-3">
          One consignment can include multiple kit types. Each kit line gets its own dispatch ID (same consignment / tracking number). Remove extra kit lines if you only need one.
        </p>

        <Button
          variant="gradient"
          type="submit"
          className="w-full py-3"
          disabled={hasStockIssue || duplicateKitTypes || submitting}
        >
          {submitting
            ? 'Creating dispatch…'
            : `Dispatch${kitLines.length > 1 ? ` ${kitLines.length} kit lines` : ''}`}
        </Button>
      </form>
    </Modal>
  );
};

export default AdminDispatchModal;
