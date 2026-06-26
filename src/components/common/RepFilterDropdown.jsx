import { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline';

export default function RepFilterDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = options.find((o) => o.id === value);
  const label = value === 'all' ? 'All' : selected?.name ?? 'All';

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 min-w-[160px] text-sm border border-rs-border rounded-[5px] px-3 py-1.5 bg-white text-rs-text focus:outline-none focus:ring-1 focus:ring-rs-teal hover:border-rs-teal/50 transition-colors"
      >
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDownIcon className={`h-3.5 w-3.5 text-rs-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white border border-rs-border rounded-card shadow-lg overflow-hidden">
          <div className="max-h-72 overflow-y-auto">
            {[{ id: 'all', name: 'All' }, ...options].map((opt) => (
              <button
                key={opt.id}
                onClick={() => { onChange(opt.id); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-rs-surface transition-colors
                  ${value === opt.id ? 'font-semibold text-rs-teal bg-rs-teal/5' : 'text-rs-text'}`}
              >
                <span className="flex-1 truncate">{opt.name}</span>
                {value === opt.id && <CheckIcon className="h-3.5 w-3.5 text-rs-teal shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
