export default function downloadPdfBlob(data, filename) {
  const blob = new Blob([data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadDispatchInvoicePdf(api, endpoint) {
  const res = await api.get(endpoint, { responseType: 'blob' });
  const disposition = res.headers?.['content-disposition'] || res.headers?.['Content-Disposition'] || '';
  const match = String(disposition).match(/filename="?([^"]+)"?/i);
  downloadPdfBlob(res.data, match?.[1] || 'WizKlub-Dispatch-invoice.pdf');
}
