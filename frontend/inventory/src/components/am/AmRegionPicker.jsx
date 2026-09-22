import React from 'react';
import { ArrowRight, MapPin } from 'lucide-react';
import Modal from '../ui/Modal';

const AmRegionPicker = ({
  isOpen,
  divisions = [],
  selectedId = '',
  required = false,
  onSelect,
  onClose,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    dismissible={!required}
    title="Which region do you want to manage?"
    className="max-w-[560px] rounded-[20px]"
  >
    <p className="mb-5 text-sm text-wk-muted">
      You handle more than one region. Choose one to open its schools, dispatches, audits, and approvals.
    </p>
    <div className="grid gap-3">
      {divisions.map((division) => {
        const isCurrent = String(division._id) === String(selectedId);
        return (
          <button
            key={division._id}
            type="button"
            onClick={() => onSelect(division._id)}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
              isCurrent
                ? 'border-wk-orange bg-wk-peach'
                : 'border-wk-line bg-white hover:border-wk-peach-2 hover:bg-wk-cream'
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wk-peach text-wk-orange-text">
              <MapPin size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-wk-ink">{division.name}</p>
              <p className="text-xs text-wk-muted">
                {division.schoolCount} school{division.schoolCount === 1 ? '' : 's'}
              </p>
            </div>
            <ArrowRight size={18} className="shrink-0 text-wk-orange-text" />
          </button>
        );
      })}
    </div>
  </Modal>
);

export default AmRegionPicker;
