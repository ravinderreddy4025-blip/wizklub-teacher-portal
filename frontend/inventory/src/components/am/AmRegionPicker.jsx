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
    <p className="mb-5 text-sm text-[#6B7280]">
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
                ? 'border-[#F89C28] bg-[#F89C28]/10'
                : 'border-[#E5E7EB] bg-white hover:border-[#F89C28]/50 hover:bg-[#F8FAFC]'
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F89C28]/15 text-[#F89C28]">
              <MapPin size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[#1F2937]">{division.name}</p>
              <p className="text-xs text-[#6B7280]">
                {division.schoolCount} school{division.schoolCount === 1 ? '' : 's'}
              </p>
            </div>
            <ArrowRight size={18} className="shrink-0 text-[#F89C28]" />
          </button>
        );
      })}
    </div>
  </Modal>
);

export default AmRegionPicker;
