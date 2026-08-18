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
  const seen = new Set();
  const assigned = [];

  divisions.forEach((division) => {
    const rmId = getRefId(division.regionalManagerId);
    const legacyDivId = getRefId(am.divisionId);
    const isAssigned =
      (rmId && rmId === amId) ||
      (legacyDivId && legacyDivId === String(division._id));

    if (isAssigned && !seen.has(division._id)) {
      seen.add(division._id);
      assigned.push(division);
    }
  });

  return assigned.sort((a, b) => a.name.localeCompare(b.name));
}

function divisionHasAm(division, ams) {
  if (getRefId(division.regionalManagerId)) return true;
  return ams.some((am) => getRefId(am.divisionId) === String(division._id));
}

import { filterProductionAms } from '../../utils/testData';

const AdminAccountManagers = ({ ams, divisions, schoolCountByDivision = {}, onRefresh, onShowPassword }) => {
  const productionAms = useMemo(() => filterProductionAms(ams), [ams]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ id: null, name: '', email: '', divisionId: '' });
  const [saving, setSaving] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [revealedPasswords, setRevealedPasswords] = useState({});
  const [search, setSearch] = useState('');

  const divisionsWithoutAM = divisions.filter((d) => !divisionHasAm(d, ams));

  const amDivisionMap = useMemo(() => {
    const map = new Map();
    productionAms.forEach((am) => {
      map.set(am._id, getDivisionsForAm(am, divisions));
    });
    return map;
  }, [productionAms, divisions]);

  const filteredAms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return productionAms;
    return productionAms.filter((am) => {
      const assigned = amDivisionMap.get(am._id) || [];
      return (
        am.name?.toLowerCase().includes(q) ||
        am.email?.toLowerCase().includes(q) ||
        assigned.some((d) => d.name?.toLowerCase().includes(q))
      );
    });
  }, [productionAms, amDivisionMap, search]);

  const openModal = (am = null) => {
    if (am) {
      setForm({
        id: am._id,
        name: am.name,
        email: am.email,
        divisionId: am.divisionId?._id || am.divisionId || '',
      });
    } else {
      setForm({ id: null, name: '', email: '', divisionId: divisionsWithoutAM[0]?._id || '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (form.id) {
        await api.put(`/admin/ams/${form.id}`, { name: form.name, email: form.email });
        toast.success('Account Manager updated');
        setIsModalOpen(false);
        onRefresh();
      } else {
        const res = await api.post('/admin/ams', {
          name: form.name,
          email: form.email,
          divisionId: form.divisionId,
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
        toast.success(res.data.emailSent ? 'AM created — credentials emailed' : 'AM created — see password');
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
      toast.success(res.data.emailSent ? 'Password regenerated — email sending' : 'Password regenerated');
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
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search managers..."
            aria-label="Search account managers"
            className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white py-2 pl-10 pr-4 text-sm text-[#1F2937] outline-none transition focus:border-[#F89C28] focus:ring-2 focus:ring-[#F89C28]/15"
          />
        </div>
        <button
          type="button"
          onClick={() => openModal()}
          disabled={divisionsWithoutAM.length === 0}
          title={divisionsWithoutAM.length === 0 ? 'All divisions already have an Account Manager' : undefined}
          className="stitch-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add Account Manager
        </button>
      </div>

      <section className="stitch-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="stitch-table-head">
              <tr className="border-b border-[var(--stitch-border)]">
                {['Name', 'Email', 'Password', 'Divisions', 'Schools', 'Actions'].map((col) => (
                  <th key={col} className={`px-4 py-3 ${col === 'Actions' ? 'text-right' : ''}`}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filteredAms.map((am) => {
                const assignedDivisions = amDivisionMap.get(am._id) || [];
                const totalSchools = assignedDivisions.reduce(
                  (sum, d) => sum + (schoolCountByDivision[d._id] || 0),
                  0,
                );
                const revealed = revealedPasswords[am._id];
                const loadingPassword = viewingId === am._id;
                return (
                  <tr key={am._id} className="transition hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F89C28]/15 text-xs font-bold text-[#F89C28]">
                          {initials(am.name)}
                        </div>
                        <span className="text-sm font-bold text-[#1F2937]">{am.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#6B7280]">{am.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-[10rem] items-center gap-1">
                        <span className={`truncate font-mono text-sm ${revealed ? 'text-[#1F2937]' : 'text-[#9CA3AF]'}`}>
                          {revealed || '••••••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleViewPassword(am)}
                          disabled={loadingPassword}
                          className="rounded-lg p-1.5 text-[#6B7280] transition hover:bg-[#F89C28]/10 hover:text-[#F89C28] disabled:opacity-50"
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
                            className="rounded-lg p-1.5 text-[#6B7280] transition hover:bg-[#F89C28]/10 hover:text-[#F89C28]"
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
                                className="inline-flex rounded-full border border-[#F89C28]/20 bg-[#F89C28]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#F89C28]"
                              >
                                {division.name}
                                {count > 0 && (
                                  <span className="ml-1.5 font-semibold normal-case tracking-normal text-[#B45309]">
                                    ({count})
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="inline-flex rounded-full bg-[#EF4444]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#EF4444]">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#1F2937]">
                      {assignedDivisions.length > 0 ? totalSchools : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openModal(am)}
                          className="rounded-lg p-2 text-[#6B7280] transition hover:bg-[#F89C28]/10 hover:text-[#F89C28]"
                          aria-label="Edit account manager"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRegenerate(am._id, am.name)}
                          disabled={regeneratingId === am._id}
                          className="rounded-lg p-2 text-[#6B7280] transition hover:bg-[#F89C28]/10 hover:text-[#F89C28] disabled:opacity-50"
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
                          className="rounded-lg p-2 text-[#6B7280] transition hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
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
                  <td colSpan="6" className="px-6 py-12 text-center text-[#6B7280]">
                    {productionAms.length === 0
                      ? 'No Account Managers yet. Create a division first, then add an AM.'
                      : 'No managers match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#E5E7EB] bg-[#F8FAFC]/50 px-6 py-3 text-sm text-[#6B7280]">
          Showing {filteredAms.length} of {productionAms.length} Account Managers
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
            className="group flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#F89C28] text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:bg-[#E88914] disabled:opacity-60"
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
          {!form.id && (
            <div className="space-y-2">
              <label className={labelClass}>Division</label>
              <select
                className={fieldClass}
                value={form.divisionId}
                onChange={(e) => setForm({ ...form, divisionId: e.target.value })}
                required
              >
                <option value="">Select division</option>
                {divisionsWithoutAM.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!form.id && (
            <p className="rounded-xl border border-[#F89C28]/15 bg-[#F89C28]/5 px-3 py-3 text-xs text-[#6B7280]">
              A secure password will be generated and emailed. Admins can view it anytime from this page.
            </p>
          )}
          {form.id && (() => {
            const assigned = getDivisionsForAm(
              { _id: form.id, divisionId: form.divisionId },
              divisions,
            );
            if (assigned.length === 0) return null;
            return (
              <div className="space-y-2">
                <label className={labelClass}>Assigned divisions</label>
                <div className="flex flex-wrap gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                  {assigned.map((d) => (
                    <span
                      key={d._id}
                      className="inline-flex rounded-full border border-[#F89C28]/20 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#F89C28]"
                    >
                      {d.name}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-[#6B7280]">
                  Division assignments are managed via Divisions or Assign operational AMs.
                </p>
              </div>
            );
          })()}
        </form>
      </Modal>
    </>
  );
};

export default AdminAccountManagers;
