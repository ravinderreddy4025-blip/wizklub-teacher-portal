import React, { useEffect, useState } from 'react';
import api from '@inventory/utils/api';
import toast from '@inventory/utils/toast';
import OperationsKpiPanel from '@inventory/components/shared/OperationsKpiPanel';
import downloadPdfBlob from '@inventory/utils/downloadPdfBlob';

export default function SchoolOperationsKpis({ month }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await api.get('/school/reports/summary', { params: { month } });
        if (!cancelled) setSummary(res.data.summary || null);
      } catch (err) {
        console.error(err);
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      const res = await api.get('/school/reports/pdf', {
        params: { month },
        responseType: 'blob',
      });
      downloadPdfBlob(res.data, `wizklub-school-report-${month}.pdf`);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error('Failed to download school report PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <OperationsKpiPanel
      summary={summary}
      loading={loading}
      onDownloadPdf={handleDownloadPdf}
      downloading={downloading}
    />
  );
}
