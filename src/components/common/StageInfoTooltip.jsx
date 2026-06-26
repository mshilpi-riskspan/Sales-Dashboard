import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { InformationCircleIcon } from '@heroicons/react/24/outline';

export default function StageInfoTooltip({ stage }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (btnRef.current && !btnRef.current.closest('[data-tooltip-root]')?.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleOpen() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.top + window.scrollY, left: rect.right + 8 + window.scrollX });
    }
    setOpen((o) => !o);
  }

  return (
    <div data-tooltip-root className="inline-block">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="text-rs-muted hover:text-rs-teal transition-colors"
        title="Stage details"
      >
        <InformationCircleIcon className="h-4 w-4" />
      </button>

      {open && createPortal(
        <div
          data-tooltip-root
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-80 rounded-card border border-rs-border bg-white shadow-lg text-xs text-rs-text"
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}
