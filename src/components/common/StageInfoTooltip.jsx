import { useState, useRef, useEffect } from 'react';
import { InformationCircleIcon } from '@heroicons/react/24/outline';

export default function StageInfoTooltip({ stage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-rs-muted hover:text-rs-teal transition-colors"
        title="Stage details"
      >
        <InformationCircleIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute left-6 top-0 z-50 w-80 rounded-card border border-rs-border bg-white shadow-lg text-xs text-rs-text">
          <div className="bg-rs-navy text-white px-3 py-2 rounded-t-card font-semibold">
            Stage {stage.order}: {stage.name}
          </div>
          <div className="p-3 space-y-3">
            <div>
              <p className="font-semibold text-rs-muted uppercase tracking-wide text-[10px] mb-1">Definition</p>
              <p className="leading-relaxed">{stage.definition}</p>
            </div>
            <div>
              <p className="font-semibold text-rs-muted uppercase tracking-wide text-[10px] mb-1">Exit Criteria</p>
              <p className="leading-relaxed">{stage.exitCriteria}</p>
            </div>
            {stage.dayLimit && (
              <div>
                <p className="font-semibold text-rs-muted uppercase tracking-wide text-[10px] mb-1">Days Limit</p>
                <p>{stage.dayLimit} days</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
