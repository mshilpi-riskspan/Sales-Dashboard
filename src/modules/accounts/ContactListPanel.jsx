import SlidePanel from '../../components/common/SlidePanel';

// List-only — a contact card already shows everything we have on a contact,
// a third drill level would show nothing new.
export default function ContactListPanel({ contacts, onClose }) {
  return (
    <SlidePanel
      open={!!contacts}
      onClose={onClose}
      title="Key Contacts"
      subtitle={`${contacts?.length || 0} contact${contacts?.length === 1 ? '' : 's'}`}
      width={480}
    >
      <div className="p-4">
        {(!contacts || contacts.length === 0) ? (
          <p className="text-xs text-rs-muted">No contacts found in Salesforce for this account.</p>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => {
              const name = [c.FirstName, c.LastName].filter(Boolean).join(' ') || '—';
              const initials = [c.FirstName?.[0], c.LastName?.[0]].filter(Boolean).join('').toUpperCase();
              return (
                <div key={c.Id} className="flex items-center gap-3 p-2.5 rounded-lg bg-rs-surface/50 border border-rs-border/30">
                  <div className="w-8 h-8 rounded-full bg-rs-navy flex items-center justify-center text-white text-xs font-semibold shrink-0">
                    {initials || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-rs-text">{name}</p>
                    {c.Title && <p className="text-[10px] text-rs-muted truncate">{c.Title}</p>}
                    {c.Email && (
                      <a href={`mailto:${c.Email}`} className="text-[10px] text-rs-teal hover:underline block truncate">
                        {c.Email}
                      </a>
                    )}
                    {c.Phone && (
                      <a href={`tel:${c.Phone}`} className="text-[10px] text-rs-muted hover:text-rs-teal hover:underline block truncate transition-colors">
                        {c.Phone}
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 p-3 rounded-lg bg-rs-surface border border-dashed border-rs-border text-xs text-rs-muted">
          CEO / CRO auto-enrichment coming soon — will auto-update from public sources
        </div>
      </div>
    </SlidePanel>
  );
}
