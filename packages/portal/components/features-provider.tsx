'use client';

import { createContext, useContext, useMemo } from 'react';

interface FeaturesContextValue {
  features: string[];
  hasFeature: (key: string) => boolean;
}

const FeaturesContext = createContext<FeaturesContextValue>({
  features: [],
  hasFeature: () => false,
});

interface FeaturesProviderProps {
  features: string[];
  children: React.ReactNode;
}

/** Client component that makes the enabled feature keys available to any descendant. */
export function FeaturesProvider({ features, children }: FeaturesProviderProps) {
  const value = useMemo<FeaturesContextValue>(
    () => ({
      features,
      hasFeature: (key: string) => features.includes(key),
    }),
    [features],
  );

  return <FeaturesContext value={value}>{children}</FeaturesContext>;
}

/** Returns the full array of enabled feature keys for the current customer. */
export function useFeatures(): string[] {
  return useContext(FeaturesContext).features;
}

/** Returns true if the given feature key is enabled for the current customer. */
export function useHasFeature(key: string): boolean {
  return useContext(FeaturesContext).hasFeature(key);
}
