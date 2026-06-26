export default function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <p className="font-medium">Failed to load data</p>
      {message && <p className="mt-1 text-red-600 opacity-80">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-xs font-medium text-red-700 underline hover:no-underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
