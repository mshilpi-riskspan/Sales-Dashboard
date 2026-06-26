export default function EmptyState({ message = 'No data available' }) {
  return (
    <div className="flex items-center justify-center py-10 text-sm text-rs-muted">
      {message}
    </div>
  );
}
