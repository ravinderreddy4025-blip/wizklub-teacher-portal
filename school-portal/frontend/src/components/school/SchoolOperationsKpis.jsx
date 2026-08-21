import React, { useEffect, useState } from 'react';
import api from '@inventory/utils/api';
import toast from '@inventory/utils/toast';
import SchoolOperationsBoard from '@inventory/components/school/SchoolOperationsBoard';
import downloadPdfBlob from '@inventory/utils/downloadPdfBlob';

export default function SchoolOperationsKpis({ month }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await api.get('/school/reports/summary', { params: { month } });
        if (!cancelled) setData(res.data || null);
      } catch (err) {
        console.error(err);
        if (!cancelled) setData(null);
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
    <SchoolOperationsBoard
      month={data?.month || month}
      period={data?.period}
      current={data?.current}
      inventory={data?.inventory}
      inventoryHealth={data?.inventoryHealth}
      attention={data?.attention}
      loading={loading}
      onDownloadPdf={handleDownloadPdf}
      downloading={downloading}
    />
  );
}
