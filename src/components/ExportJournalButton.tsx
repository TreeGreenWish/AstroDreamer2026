import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

export function ExportJournalButton() {
  const [working, setWorking] = useState(false);

  async function downloadBackup() {
    if (working) return;
    setWorking(true);
    try {
      const response = await fetch('/api/export');
      if (!response.ok) throw new Error('Backup failed');
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `astradream-export-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Backup download failed', error);
      alert('Could not download your backup. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <button
      onClick={downloadBackup}
      disabled={working}
      className="fixed top-20 right-6 z-40 flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/50 backdrop-blur-md transition-all hover:border-gold/30 hover:bg-gold/10 hover:text-gold disabled:opacity-50"
      title="Download a full AstraDream backup"
    >
      {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Backup
    </button>
  );
}
