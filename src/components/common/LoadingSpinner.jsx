export default function LoadingSpinner({ size = 'md' }) {
  const sz = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-10 w-10' : 'h-6 w-6';
  return (
    <div className={`${sz} animate-spin rounded-full border-2 border-rs-border border-t-rs-teal`} />
  );
}
