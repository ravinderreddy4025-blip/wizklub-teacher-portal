import React from 'react';
import { Camera } from 'lucide-react';
import { assetUrl } from './IssueEvidencePanel';

// Displays the admin-captured dispatch proof photo (shipment snapshot).
// Shown to AM and schools as proof that the package was sent.
const DispatchProofPhoto = ({ url, size = 'md', label = 'Dispatch proof' }) => {
  if (!url) return null;

  const src = assetUrl(url);
  const dims = size === 'sm' ? 'h-12 w-12' : size === 'lg' ? 'h-28 w-28' : 'h-20 w-20';

  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
          <Camera size={12} /> {label}
        </p>
      )}
      <a href={src} target="_blank" rel="noopener noreferrer" className="inline-block shrink-0">
        <img
          src={src}
          alt="Dispatch proof"
          className={`rounded-lg border border-slate-200 object-cover bg-white ${dims} hover:ring-2 hover:ring-brand-primary/40 transition`}
        />
      </a>
    </div>
  );
};

export default DispatchProofPhoto;
