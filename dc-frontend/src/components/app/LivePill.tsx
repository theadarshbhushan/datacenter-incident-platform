export function LivePill({ label = 'Live' }: { label?: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-healthy-line bg-healthy-bg px-3 text-sm font-medium text-brand-700">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
      </span>
      {label}
    </span>
  );
}
