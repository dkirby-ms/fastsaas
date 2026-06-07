'use client';

import { useHasFeature } from '@/components/features-provider';

interface LockedFeatureProps {
  /** Feature key to check against the customer's enabled features. */
  feature: string;
  /** Accessible label shown in the locked overlay (e.g. "Export CSV"). */
  label: string;
  /** The inline element to render when the feature is unlocked, or to grey out when locked. */
  children: React.ReactNode;
}

/**
 * Renders `children` when the feature is enabled.
 * When locked, renders a greyed-out overlay with a lock icon and "Pro" badge over the children.
 */
export function LockedFeature({ feature, label, children }: LockedFeatureProps) {
  const enabled = useHasFeature(feature);

  if (enabled) {
    return <>{children}</>;
  }

  return (
    <span className="relative inline-flex items-center" title={`${label} — upgrade to unlock`}>
      {/* Blur + dim the locked content so users can see what they're missing */}
      <span className="pointer-events-none select-none opacity-40 blur-[1.5px]" aria-hidden="true">
        {children}
      </span>

      {/* Accessible replacement for screen readers */}
      <span className="sr-only">{label} (locked — upgrade required)</span>

      {/* Lock overlay */}
      <span
        className="absolute inset-0 flex items-center justify-center gap-1 rounded"
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3.5 w-3.5 flex-none text-slate-500 dark:text-slate-400"
        >
          <path
            fillRule="evenodd"
            d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2.5 6V4.5a2.5 2.5 0 0 0-5 0V7h5Z"
            clipRule="evenodd"
          />
        </svg>
        <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
          Pro
        </span>
      </span>
    </span>
  );
}
