import { useEffect } from 'react';

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function isDreamTimeInput(input: HTMLInputElement) {
  const form = input.closest('form');
  if (form) {
    const text = form.textContent || '';
    if (text.includes('Interpret & Save Dream')) return true;
    if (text.includes('Begin Your Journey')) return false;
  }
  const container = input.closest('.glass');
  return Boolean(container?.textContent?.includes('Save Changes'));
}

function visibleUnknownSelection() {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-dream-time-input="true"]'));
  const active = inputs.find(input => input.offsetParent !== null && input.dataset.timeUnknown === 'true');
  return Boolean(active);
}

function decorateDreamTimeInputs() {
  for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input[type="time"]'))) {
    if (!isDreamTimeInput(input) || input.dataset.dreamTimeInput === 'true') continue;
    input.dataset.dreamTimeInput = 'true';
    const unknownInitially = !input.value;
    input.dataset.timeUnknown = unknownInitially ? 'true' : 'false';
    input.disabled = unknownInitially;

    const wrapper = document.createElement('label');
    wrapper.dataset.unknownTimeControl = 'true';
    wrapper.className = 'mt-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/40 cursor-pointer select-none';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = unknownInitially;
    checkbox.className = 'accent-[#d4af37]';
    const text = document.createElement('span');
    text.textContent = 'Unknown time';
    wrapper.append(checkbox, text);

    checkbox.addEventListener('change', () => {
      const unknown = checkbox.checked;
      input.dataset.timeUnknown = unknown ? 'true' : 'false';
      input.disabled = unknown;
      if (unknown) {
        input.dataset.previousTime = input.value;
        setNativeInputValue(input, '');
      } else {
        const previous = input.dataset.previousTime;
        const now = new Date();
        const fallback = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setNativeInputValue(input, previous || fallback);
      }
    });

    input.parentElement?.appendChild(wrapper);
  }
}

function decorateUnknownTimeDisplay() {
  // Dream Detail renders the time as the span between two bullet separators.
  for (const row of Array.from(document.querySelectorAll<HTMLDivElement>('div.font-mono'))) {
    const spans = Array.from(row.children).filter((node): node is HTMLSpanElement => node instanceof HTMLSpanElement);
    for (let i = 1; i < spans.length - 1; i += 1) {
      if (spans[i - 1].textContent?.trim() === '•' && spans[i + 1].textContent?.trim() === '•' && !spans[i].textContent?.trim()) {
        spans[i].textContent = 'Time unknown';
        spans[i].classList.add('text-gold/70');
      }
    }
  }
}

function patchDreamPayload(input: RequestInfo | URL, init?: RequestInit) {
  if (!init?.body || typeof init.body !== 'string') return init;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  const method = String(init.method || 'GET').toUpperCase();
  const isInterpret = url.includes('/api/ai/interpret-dream');
  const isDreamCreate = url.endsWith('/api/dreams') && method === 'POST';
  const isDreamUpdate = /\/api\/dreams\/\d+/.test(url) && method === 'PUT';
  if (!isInterpret && !isDreamCreate && !isDreamUpdate) return init;

  try {
    const payload = JSON.parse(init.body);
    const target = isInterpret ? payload.dream : payload;
    if (!target || typeof target !== 'object') return init;
    const unknown = target.time_known === false || visibleUnknownSelection() || target.time === null || target.time === '';
    target.time_known = !unknown;
    target.time = unknown ? null : target.time;
    return { ...init, body: JSON.stringify(payload) };
  } catch {
    return init;
  }
}

export default function UnknownDreamTimeSupport() {
  useEffect(() => {
    decorateDreamTimeInputs();
    decorateUnknownTimeDisplay();
    const observer = new MutationObserver(() => {
      decorateDreamTimeInputs();
      decorateUnknownTimeDisplay();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const previousFetch = window.fetch;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => previousFetch(input, patchDreamPayload(input, init))) as typeof window.fetch;

    return () => {
      observer.disconnect();
      window.fetch = previousFetch;
      document.querySelectorAll('[data-unknown-time-control="true"]').forEach(node => node.remove());
    };
  }, []);

  return null;
}
