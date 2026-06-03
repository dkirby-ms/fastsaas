import type { Subscription } from '@fastsaas/shared';

export const mockSubscriptionGateCookieName = 'fastsaas.portal.subscription-gate';

export function hasMockSubscriptionAccess(subscription: Subscription | null): boolean {
  return subscription !== null;
}

export function decodeMockSubscriptionGateCookie(value: string | undefined): boolean {
  return value === '1';
}

export function writeMockSubscriptionGateCookie(subscription: Subscription | null) {
  if (typeof document === 'undefined') {
    return;
  }

  if (hasMockSubscriptionAccess(subscription)) {
    document.cookie = `${mockSubscriptionGateCookieName}=1; Path=/; SameSite=Lax; Max-Age=31536000`;
    return;
  }

  document.cookie = `${mockSubscriptionGateCookieName}=; Path=/; SameSite=Lax; Max-Age=0`;
}
