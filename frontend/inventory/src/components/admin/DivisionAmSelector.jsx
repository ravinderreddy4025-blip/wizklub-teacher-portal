import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from '../../utils/toast';
import api from '../../utils/api';
import { resolveAssignedAm } from '../../utils/divisionAm';

const fieldClass = 'stitch-input px-3';
const labelClass = 'stitch-label';

function getRefId(ref) {
  if (!ref) return null;
  return String(typeof ref === 'object' ? ref._id : ref);
}

function divisionOwnerId(division, ams) {
  const rmId = getRefId(division?.regionalManagerId);
  if (rmId) return rmId;
  const holder = ams.find((am) => getRefId(am.divisionId) === String(division?._id));
  return holder ? String(holder._id) : null;
}

const DivisionAmSelector = ({
  divisionId,
  onDivisionChange,
  divisions = [],
  ams = [],
  allowCreate = true,
  onRefresh,
  showAmPanel = true,
}) => {
  const [mode, setMode] = useState('select');
  const [creating, setCreating] = useState(false);
  const [assigningAm, setAssigningAm] = useState(false);
  const [newDivision, setNewDivision] = useState({ name: '', description: '' });
  const [amMode, setAmMode] = useState('existing');
  const [selectedAmId, setSelectedAmId] = useState('');
  const [newAm, setNewAm] = useState({ name: '', email: '' });

  const sortedDivisions = useMemo(
    () => [...divisions].sort((a, b) => a.name.localeCompare(b.name)),
    [divisions],
  );

  const selectedDivision = sortedDivisions.find((d) => String(d._id) === String(divisionId)) || null;
  const assignedAm = useMemo(() => {
    if (!divisionId) return null;
    return resolveAssignedAm({ divisionId }, divisions, ams);
  }, [divisionId, divisions, ams]);

  const availableAms = useMemo(() => {
    if (!selectedDivision) return ams;
    const ownerId = divisionOwnerId(selectedDivision, ams);
    return ams.filter((am) => {
      const amId = String(am._id);
      if (ownerId === amId) return true;
      return !ownerId;
    });
  }, [ams, selectedDivision]);

  const handleCreateDivision = async () => {
    if (!newDivision.name.trim()) {
      toast.error('Division name is required');
      return;
    }
    setCreating(true);
    try {
      const payload = {
        name: newDivision.name.trim(),
        description: newDivision.description.trim(),
      };
      if (amMode === 'existing' && selectedAmId) {
        payload.regionalManagerId = selectedAmId;
      } else if (amMode === 'new' && newAm.name.trim() && newAm.email.trim()) {
        payload.newAm = { name: newAm.name.trim(), email: newAm.email.trim() };
      }
      const res = await api.post('/admin/divisions/setup', payload);
      const created = res.data.division;
      onDivisionChange(created._id);
      setMode('select');
      setNewDivision({ name: '', description: '' });
      setNewAm({ name: '', email: '' });
      setSelectedAmId('');
      if (res.data.generatedPassword) {
        toast.success('Division created with new AM — copy password from Account Managers');
      } else {
        toast.success('Division created');
      }
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create division');
    } finally {
      setCreating(false);
    }
  };

  const handleAssignAm = async () => {
    if (!divisionId) return;
    setAssigningAm(true);
    try {
      const payload = amMode === 'existing'
        ? { regionalManagerId: selectedAmId }
        : { newAm: { name: newAm.name.trim(), email: newAm.email.trim() } };
      await api.put(`/admin/divisions/${divisionId}/am`, payload);
      toast.success('Account Manager assigned');
      setAmMode('existing');
      setSelectedAmId('');
      setNewAm({ name: '', email: '' });
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign Account Manager');
    } finally {
      setAssigningAm(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className={labelClass}>Division</label>
        {mode === 'select' ? (
          <select
            className={fieldClass}
            value={divisionId || ''}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '__create__') {
                setMode('create');
                return;
              }
              onDivisionChange(value);
            }}
            required
          >
            <option value="">Select division</option>
            {sortedDivisions.map((division) => (
              <option key={division._id} value={division._id}>{division.name}</option>
            ))}
            {allowCreate && <option value="__create__">+ Create new division</option>}
          </select>
        ) : (
          <div className="space-y-3 rounded-xl border border-wk-line bg-wk-cream p-4">
            <input
              className={fieldClass}
              placeholder="Division name"
              value={newDivision.name}
              onChange={(e) => setNewDivision((prev) => ({ ...prev, name: e.target.value }))}
            />
            <input
              className={fieldClass}
              placeholder="Description (optional)"
              value={newDivision.description}
              onChange={(e) => setNewDivision((prev) => ({ ...prev, description: e.target.value }))}
            />
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-wk-muted">Account Manager (optional)</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${amMode === 'existing' ? 'bg-wk-orange text-white' : 'bg-white border border-wk-line'}`}
                  onClick={() => setAmMode('existing')}
                >
                  Existing AM
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${amMode === 'new' ? 'bg-wk-orange text-white' : 'bg-white border border-wk-line'}`}
                  onClick={() => setAmMode('new')}
                >
                  New AM
                </button>
              </div>
              {amMode === 'existing' ? (
                <select
                  className={fieldClass}
                  value={selectedAmId}
                  onChange={(e) => setSelectedAmId(e.target.value)}
                >
                  <option value="">Assign later</option>
                  {ams.map((am) => (
                    <option key={am._id} value={am._id}>{am.name} ({am.email})</option>
                  ))}
                </select>
              ) : (
                <div className="space-y-2">
                  <input
                    className={fieldClass}
                    placeholder="AM name"
                    value={newAm.name}
                    onChange={(e) => setNewAm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                  <input
                    className={fieldClass}
                    placeholder="AM email"
                    value={newAm.email}
                    onChange={(e) => setNewAm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="stitch-btn-primary flex-1"
                onClick={handleCreateDivision}
                disabled={creating}
              >
                {creating ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Create division'}
              </button>
              <button
                type="button"
                className="stitch-btn-secondary"
                onClick={() => setMode('select')}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {showAmPanel && divisionId && mode === 'select' && (
        <div className="rounded-xl border border-wk-line bg-[#F8FAFC] p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-wk-muted">Account Manager</p>
          {assignedAm ? (
            <p className="text-sm text-wk-ink">
              <span className="font-semibold">{assignedAm.name}</span>
              <span className="text-wk-muted"> — {assignedAm.email}</span>
            </p>
          ) : (
            <>
              <p className="text-sm text-wk-muted">No Account Manager assigned to this division yet.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${amMode === 'existing' ? 'bg-wk-orange text-white' : 'bg-white border border-wk-line'}`}
                  onClick={() => setAmMode('existing')}
                >
                  Assign existing
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${amMode === 'new' ? 'bg-wk-orange text-white' : 'bg-white border border-wk-line'}`}
                  onClick={() => setAmMode('new')}
                >
                  Create new
                </button>
              </div>
              {amMode === 'existing' ? (
                <select
                  className={fieldClass}
                  value={selectedAmId}
                  onChange={(e) => setSelectedAmId(e.target.value)}
                >
                  <option value="">Select AM</option>
                  {availableAms.map((am) => (
                    <option key={am._id} value={am._id}>{am.name} ({am.email})</option>
                  ))}
                </select>
              ) : (
                <div className="space-y-2">
                  <input
                    className={fieldClass}
                    placeholder="AM name"
                    value={newAm.name}
                    onChange={(e) => setNewAm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                  <input
                    className={fieldClass}
                    placeholder="AM email"
                    value={newAm.email}
                    onChange={(e) => setNewAm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              )}
              <button
                type="button"
                className="stitch-btn-secondary w-full"
                onClick={handleAssignAm}
                disabled={assigningAm || (amMode === 'existing' ? !selectedAmId : !newAm.name.trim() || !newAm.email.trim())}
              >
                {assigningAm ? 'Assigning…' : 'Assign Account Manager'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DivisionAmSelector;
