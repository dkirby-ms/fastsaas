export function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.find((entry) => typeof entry === 'string' && entry.length > 0);
  }

  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function sanitizeCallbackUrl(value: string | undefined, fallback = '/dashboard'): string {
  if (!value?.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  try {
    const parsed = new URL(value, 'https://fastsaas.local');
    if (parsed.origin !== 'https://fastsaas.local') {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function buildLandingPath(token: string, subscriptionId?: string): string {
  const params = new URLSearchParams({ token });

  if (subscriptionId) {
    params.set('subscriptionId', subscriptionId);
  }

  return `/landing?${params.toString()}`;
}
