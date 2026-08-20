import { Download } from 'lucide-react';

export function ExportJournalButton() {
  return (
    <a
      href="/api/export"
      className="fixed top-20 right-6 z-40 flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/50 backdrop-blur-md transition-all hover:border-gold/30 hover:bg-gold/10 hover:text-gold"
      title="Download a full AstraDream backup"
    >
      <Download className="h-4 w-4" />
      Backup
    </a>
  );
}
