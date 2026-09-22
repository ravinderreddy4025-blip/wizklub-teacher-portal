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
      <div className={`rounded-2xl bg-white shadow-card p-6 ${className}`}>
        <p className="text-sm text-wk-muted">Loading AM operations…</p>
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
        className="border-wk-peach-2 shadow-brand"
      />
      <AmOpenIssues current={current} />
    </div>
  );
}
