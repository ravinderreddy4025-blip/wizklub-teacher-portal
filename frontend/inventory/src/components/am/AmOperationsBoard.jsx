import React from 'react';
import AttentionQueues from '../admin/AttentionQueues';
import AmMonthlyPerformance from './AmMonthlyPerformance';
import AmNetworkHealth from './AmNetworkHealth';
import AmOpenIssues from './AmOpenIssues';

export default function AmOperationsBoard({
  month,
  period,
  current,
  attention,
  loading = false,
  onDownloadPdf,
  downloading = false,
  className = '',
}) {
  if (loading) {
    return (
      <div className={`rounded-2xl border border-[#E5E7EB] bg-white p-6 ${className}`}>
        <p className="text-sm text-[#6B7280]">Loading AM operations…</p>
      </div>
    );
  }

  return (
    <div className={`space-y-5 ${className}`}>
      <AmMonthlyPerformance
        month={month}
        period={period}
        onDownloadPdf={onDownloadPdf}
        downloading={downloading}
      />
      <AmNetworkHealth current={current} />
      <AttentionQueues
        queues={attention?.queues}
        eyebrow="My actions"
        title="What needs your intervention"
        className="border-[#F89C28]/35 shadow-[0_16px_44px_-16px_rgba(248,156,40,0.35)]"
      />
      <AmOpenIssues current={current} />
    </div>
  );
}
