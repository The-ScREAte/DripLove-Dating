import { describe, it, expect } from 'vitest';
import { isEntitledToPremium, isPastGracePeriod, SUBSCRIPTION_GRACE_PERIOD_MS } from '../subscriptionEntitlement';

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

describe('subscriptionEntitlement', () => {
  it('grants active/cancelled/payment_pending premium before expiry', () => {
    for (const status of ['active', 'cancelled', 'payment_pending']) {
      expect(isEntitledToPremium({ plan_name: 'premium', status, expires_at: ahead(60_000) })).toBe(true);
    }
  });
  it('keeps access during the grace period after expires_at', () => {
    expect(isEntitledToPremium({ plan_name: 'premium', status: 'active', expires_at: ago(10 * 60_000) })).toBe(true);
  });
  it('revokes access once past the grace period', () => {
    const expired = ago(SUBSCRIPTION_GRACE_PERIOD_MS + 60_000);
    expect(isPastGracePeriod(expired)).toBe(true);
    expect(isEntitledToPremium({ plan_name: 'premium', status: 'active', expires_at: expired })).toBe(false);
  });
  it('never grants non-premium plans, other statuses, or missing subs', () => {
    expect(isEntitledToPremium({ plan_name: 'free', status: 'active', expires_at: null })).toBe(false);
    expect(isEntitledToPremium({ plan_name: 'premium', status: 'expired', expires_at: null })).toBe(false);
    expect(isEntitledToPremium(null)).toBe(false);
  });
  it('treats a missing expires_at as not expired', () => {
    expect(isEntitledToPremium({ plan_name: 'premium', status: 'active', expires_at: null })).toBe(true);
  });
});
