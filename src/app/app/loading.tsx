export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true">
      <div className="h-3 w-40 rounded-xs bg-surface-3" />
      <div className="mt-3 h-9 w-80 max-w-full rounded-xs bg-surface-3" />
      <div className="ticks mt-8 h-3 w-full opacity-60" />
      <div className="mt-6 h-64 rounded-md border border-line bg-surface" />
    </div>
  );
}
