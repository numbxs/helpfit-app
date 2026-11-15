export function ShellSkeleton() {
  return (
    <div className="animate-pulse pt-6" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-28 rounded-full bg-muted" />
      <div className="mt-3 h-8 w-48 rounded-full bg-muted" />
      <div className="mt-6 h-72 rounded-[2rem] bg-muted" />
      <div className="mt-4 h-20 rounded-3xl bg-muted" />
    </div>
  );
}
