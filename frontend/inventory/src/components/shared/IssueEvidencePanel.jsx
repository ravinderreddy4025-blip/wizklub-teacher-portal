import React from 'react';
import { assetUrl } from '../../utils/mediaAssets';

export { assetUrl };

const IssueEvidencePanel = ({ issue, compact = false }) => {
  const photos = issue?.photoUrls || [];
  const videos = issue?.videoUrls || [];

  if (!photos.length && !videos.length) {
    return <span className="text-xs text-slate-400">No evidence uploaded</span>;
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {photos.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Photos ({photos.length})</p>
          <div className="flex flex-wrap gap-2">
            {photos.map((url) => (
              <a
                key={url}
                href={assetUrl(url)}
                target="_blank"
                rel="noopener noreferrer"
                className="block shrink-0"
              >
                <img
                  src={assetUrl(url)}
                  alt="Issue evidence"
                  className={`rounded-lg border border-slate-200 object-cover bg-white ${compact ? 'h-14 w-14' : 'h-20 w-20'}`}
                />
              </a>
            ))}
          </div>
        </div>
      )}
      {videos.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Video evidence</p>
          {videos.map((url) => (
            <video
              key={url}
              src={assetUrl(url)}
              controls
              className={`rounded-lg border border-slate-200 bg-black ${compact ? 'max-h-32 w-full' : 'max-h-48 w-full max-w-sm'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default IssueEvidencePanel;
