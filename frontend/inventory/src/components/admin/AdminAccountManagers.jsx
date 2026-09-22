import React, { useMemo, useState } from 'react';
import { ArrowRight, Copy, Eye, EyeOff, KeyRound, Pencil, Search, Trash2, Loader2 } from 'lucide-react';
import toast from '../../utils/toast';
import api from '../../utils/api';
import Modal from '../ui/Modal';

const fieldClass = 'stitch-input px-3';
const labelClass = 'stitch-label';

function initials(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || 'AM'
  );
}

function getRefId(ref) {
  if (!ref) return null;
  return String(typeof ref === 'object' ? ref._id : ref);
}

function getDivisionsForAm(am, divisions) {
  const amId = String(am._id);
  return divisions
    .filter((division) => {
      const rmId = getRefId(division.regionalManagerId);
      if (rmId) return rmId === amId;
      return getRefId(am.divisionId) === String(division._id);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function divisionOwnerId(division, ams) {
  const rmId = getRefId(division.regionalManagerId);
  if (rmId) return rmId;
  const holder = ams.find((am) => getRefId(am.divisionId) === String(division._id));
  return holder ? String(holder._id) : null;
}

function ownerNameForDivision(division, ams, excludeAmId = null) {
  const ownerId = divisionOwnerId(division, ams);
  if (!ownerId || ownerId === String(excludeAmId || '')) return null;
  const owner = ams.find((am) => String(am._id) === ownerId);
  return owner?.name || division.regionalManagerId?.name || null;
}

function divisionHasAm(division, ams) {
  return Boolean(divisionOwnerId(division, ams));
}

const AdminAccountManagers = ({ ams, divisions, schoolCountByDivision = {}, onRefresh, onShowPassword }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ id: null, name: '', email: '', divisionIds: [] });
  const [saving, setSaving] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [revealedPasswords, setRevealedPasswords] = useState({});
  const [search, setSearch] = useState('');

  const sortedDivisions = useMemo(
    () => [...divisions].sort((a, b) => a.name.localeCompare(b.name)),
    [divisions],
  );

  const amDivisionMap = useMemo(() => {
    const map = new Map();
    ams.forEach((am) => {
      map.set(am._id, getDivisionsForAm(am, divisions));
    });
    return map;
  }, [ams, divisions]);

  const filteredAms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ams;
    return ams.filter((am) => {
      const assigned = amDivisionMap.get(am._id) || [];
      return (
        am.name?.toLowerCase().includes(q) ||
        am.email?.toLowerCase().includes(q) ||
        assigned.some((d) => d.name?.toLowerCase().includes(q))
      );
    });
  }, [ams, amDivisionMap, search]);

  const openModal = (am = null) => {
    if (am) {
      setForm({
        id: am._id,
        name: am.name,
        email: am.email,
        divisionIds: getDivisionsForAm(am, divisions).map((d) => String(d._id)),
      });
    } else {
      setForm({ id: null, name: '', email: '', divisionIds: [] });
    }
    setIsModalOpen(true);
  };

  const toggleDivision = (id, locked) => {
    if (locked) return;
    const divisionId = String(id);
    setForm((prev) => {
      const selected = new Set(prev.divisionIds.map(String));
      if (selected.has(divisionId)) selected.delete(divisionId);
      else selected.add(divisionId);
      return { ...prev, divisionIds: [...selected] };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.divisionIds.length) {
      toast.error('Select at least one division');
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await api.put(`/admin/ams/${form.id}`, {
          name: form.name,
          email: form.email,
          divisionIds: form.divisionIds,
        });
        toast.success('Account Manager updated');
        setIsModalOpen(false);
        onRefresh();
      } else {
        const res = await api.post('/admin/ams', {
          name: form.name,
          email: form.email,
          divisionIds: form.divisionIds,
        });
        setIsModalOpen(false);
        onRefresh();
        onShowPassword(res.data.generatedPassword, {
          emailSent: res.data.emailSent,
          emailNote: res.data.emailNote,
          entityName: res.data.accountManager?.name || form.name,
          email: res.data.accountManager?.email || form.email,
          credentialType: 'am',
        });
        toast.success(
          res.data.emailSent
            ? 'AM created — credentials emailed'
            : `AM created — email not sent${res.data.emailNote ? `: ${res.data.emailNote}` : ''}`,
        );
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save AM');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!(await toast.confirm('Delete this Account Manager?'))) return;
    try {
      await api.delete(`/admin/ams/${id}`);
      toast.success('Account Manager deleted');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete AM');
    }
  };

  const handleRegenerate = async (id, name) => {
    if (!(await toast.confirm('Regenerate password for this Account Manager?'))) return;
    setRegeneratingId(id);
    try {
      const res = await api.post(`/admin/ams/${id}/regenerate-password`);
      onShowPassword(res.data.generatedPassword, {
        emailSent: res.data.emailSent,
        emailNote: res.data.emailNote,
        entityName: res.data.accountManager?.name || name,
        email: res.data.accountManager?.email,
        credentialType: 'am',
      });
      setRevealedPasswords((prev) => ({ ...prev, [id]: res.data.generatedPassword }));
      toast.success(
        res.data.emailSent
          ? 'Password regenerated — credentials emailed'
          : `Password regenerated — email not sent${res.data.emailNote ? `: ${res.data.emailNote}` : ''}`,
      );
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to regenerate password');
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleViewPassword = async (am) => {
    const id = am._id;
    if (revealedPasswords[id]) {
      setRevealedPasswords((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    setViewingId(id);
    try {
      const res = await api.get(`/admin/ams/${id}/password`);
      if (!res.data?.password) {
        toast.error(res.data?.message || 'Password is not available. Regenerate it to view.');
        return;
      }
      setRevealedPasswords((prev) => ({ ...prev, [id]: res.data.password }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load password');
    } finally {
      setViewingId(null);
    }
  };

  const copyPassword = async (password) => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast.success('Password copied');
    } catch {
      toast.error('Could not copy password');
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-wk-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search managers..."
            aria-label="Search account managers"
            className="h-10 w-full rounded-xl border border-wk-line bg-white py-2 pl-10 pr-4 text-sm text-wk-ink outline-none transition focus:border-wk-orange focus:ring-2 focus:ring-wk-orange-text/40"
          />
        </div>
        <button
          type="button"
          onClick={() => openModal()}
          className="stitch-btn-primary"
        >
          + Add Account Manager
        </button>
      </div>

      <section className="stitch-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="stitch-table-head">
              <tr className="border-b border-wk-line">
                {['Name', 'Email', 'Password', 'Divisions', 'Schools', 'Actions'].map((col) => (
                  <th key={col} className={`px-4 py-3 ${col === 'Actions' ? 'text-right' : ''}`}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-wk-line">
              {filteredAms.map((am) => {
                const assignedDivisions = amDivisionMap.get(am._id) || [];
                const totalSchools = assignedDivisions.reduce(
                  (sum, d) => sum + (schoolCountByDivision[d._id] || 0),
                  0,
                );
                const revealed = revealedPasswords[am._id];
                const loadingPassword = viewingId === am._id;
                return (
                  <tr key={am._id} className="transition hover:bg-wk-cream">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wk-peach text-xs font-bold text-wk-orange-text">
                          {initials(am.name)}
                        </div>
                        <span className="text-sm font-bold text-wk-ink">{am.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-wk-muted">{am.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-[10rem] items-center gap-1">
                        <span className={`truncate font-mono text-sm ${revealed ? 'text-wk-ink' : 'text-wk-muted'}`}>
                          {revealed || '••••••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleViewPassword(am)}
                          disabled={loadingPassword}
                          className="rounded-lg p-1.5 text-wk-muted transition hover:bg-wk-peach hover:text-wk-orange-text disabled:opacity-50"
                          aria-label={revealed ? 'Hide password' : 'View password'}
                          title={
                            revealed
                              ? 'Hide password'
                              : am.hasRecoverablePassword === false
                                ? 'Password not stored yet — regenerate to view'
                                : 'View password'
                          }
                        >
                          {loadingPassword ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : revealed ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                        {revealed && (
                          <button
                            type="button"
                            onClick={() => copyPassword(revealed)}
                            className="rounded-lg p-1.5 text-wk-muted transition hover:bg-wk-peach hover:text-wk-orange-text"
                            aria-label="Copy password"
                            title="Copy password"
                          >
                            <Copy size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {assignedDivisions.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {assignedDivisions.map((division) => {
                            const count = schoolCountByDivision[division._id] || 0;
                            return (
                              <span
                                key={division._id}
                                title={`${count} school${count === 1 ? '' : 's'}`}
                                className="inline-flex rounded-full border border-wk-peach-2 bg-wk-peach px-3 py-1 text-sm font-medium text-wk-orange-text"
                              >
                                {division.name}
                                {count > 0 && (
                                  <span className="ml-1.5 font-semibold normal-case tracking-normal text-warning-700">
                                    ({count})
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="inline-flex rounded-full bg-error-50 px-3 py-1 text-sm font-medium text-error-600">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-wk-ink">
                      {assignedDivisions.length > 0 ? totalSchools : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openModal(am)}
                          className="rounded-lg p-2 text-wk-muted transition hover:bg-wk-peach hover:text-wk-orange-text"
                          aria-label="Edit account manager"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRegenerate(am._id, am.name)}
                          disabled={regeneratingId === am._id}
                          className="rounded-lg p-2 text-wk-muted transition hover:bg-wk-peach hover:text-wk-orange-text disabled:opacity-50"
                          aria-label="Regenerate password"
                        >
                          {regeneratingId === am._id ? (
                            <Loader2 size={18} className="animate-spin" />
                          ) : (
                            <KeyRound size={18} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(am._id)}
                          className="rounded-lg p-2 text-wk-muted transition hover:bg-error-50 hover:text-error-600"
                          aria-label="Delete account manager"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredAms.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-wk-muted">
                    {ams.length === 0
                      ? 'No Account Managers yet. Create a division first, then add an AM.'
                      : 'No managers match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-wk-line bg-white px-4 py-3 md:px-6 text-sm text-wk-muted">
          Showing {filteredAms.length} of {ams.length} Account Managers
          {' · '}
          {divisions.filter((d) => divisionHasAm(d, ams)).length} of {divisions.length} divisions assigned
        </div>
      </section>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={form.id ? 'Edit Account Manager' : 'Add Account Manager'}
        className="max-w-[520px] rounded-[16px]"
        footer={
          <button
            type="submit"
            form="am-form"
            disabled={saving}
            className="group flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-wk-orange text-sm font-bold text-wk-navy shadow-brand transition hover:bg-wk-orange-hover disabled:opacity-60"
          >
            {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create AM & Send Credentials'}
            {!saving && <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />}
          </button>
        }
      >
        <form id="am-form" onSubmit={handleSave} className="space-y-5">
          <div className="space-y-2">
            <label className={labelClass}>Full Name</label>
            <input
              className={fieldClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Email</label>
            <input
              type="email"
              className={fieldClass}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Divisions</label>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-wk-line bg-wk-cream p-2">
              {sortedDivisions.map((division) => {
                const checked = form.divisionIds.map(String).includes(String(division._id));
                const currentOwner = ownerNameForDivision(division, ams, form.id);
                const locked = Boolean(currentOwner) && !checked;
                return (
                  <label
                    key={division._id}
                    className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                      locked
                        ? 'cursor-not-allowed opacity-60'
                        : checked
                          ? 'cursor-pointer bg-white shadow-sm'
                          : 'cursor-pointer hover:bg-white/70'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={checked}
                      disabled={locked}
                      onChange={() => toggleDivision(division._id, locked)}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-wk-ink">{division.name}</span>
                      {locked && (
                        <span className="block text-xs text-wk-muted">Assigned to {currentOwner}</span>
                      )}
                    </span>
                  </label>
                );
              })}
              {sortedDivisions.length === 0 && (
                <p className="px-2 py-3 text-xs text-wk-muted">Create a division first, then assign it here.</p>
              )}
            </div>
            <p className="text-xs text-wk-muted">
              One AM can handle multiple divisions. A division can belong to only one AM. To move a division, uncheck it on the current AM first.
            </p>
          </div>
          {!form.id && (
            <p className="rounded-xl border border-wk-peach-2 bg-wk-cream px-3 py-3 text-xs text-wk-muted">
              A secure password will be generated and emailed. Admins can view it anytime from this page.
            </p>
          )}
        </form>
      </Modal>
    </>
  );
};

export default AdminAccountManagers;
