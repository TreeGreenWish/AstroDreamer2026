import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PenLine } from 'lucide-react';

export default function CreativeNavBridge() {
  const [nav, setNav] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const locate = () => {
      const candidates = Array.from(document.querySelectorAll('nav')) as HTMLElement[];
      setNav(candidates.find(node => node.textContent?.includes('Journal')) || null);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    const stateHandler = (event: Event) => setActive(Boolean((event as CustomEvent)?.detail?.open));
    window.addEventListener('astradream:creative-open-state', stateHandler);
    return () => {
      observer.disconnect();
      window.removeEventListener('astradream:creative-open-state', stateHandler);
    };
  }, []);

  if (!nav) return null;

  return createPortal(
    <button
      onClick={() => window.dispatchEvent(new Event('astradream:open-creative'))}
      className={active
        ? 'flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 bg-gold text-deep-blue shadow-lg shadow-gold/20 font-bold'
        : 'flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 text-white/40 hover:text-white/60'}
      title="Creative Journal"
    >
      <PenLine className="w-5 h-5" />
      {active && <span className="text-sm font-medium">Creative</span>}
    </button>,
    nav,
  );
}
