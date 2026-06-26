const VARIANTS = {
  overdue: 'bg-amber-100 text-rs-overdueText border border-amber-300',
  'on-track': 'bg-green-100 text-green-700 border border-green-300',
  count: 'bg-rs-navy text-white',
  stage: 'bg-rs-teal/10 text-rs-teal',
};

export default function Badge({ variant = 'count', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${VARIANTS[variant] || VARIANTS.count} ${className}`}
    >
      {children}
    </span>
  );
}
