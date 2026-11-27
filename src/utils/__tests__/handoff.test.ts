import { describe, it, expect } from 'vitest';
import { firstNameFromAuthUser, handoffLeaveDelay, HANDOFF_MIN_MS, HANDOFF_MAX_MS, HANDOFF_SETTLE_MS } from '../handoff';

describe('handoffLeaveDelay', () => {
  it('holds the welcome moment up to the minimum when content is ready instantly', () => {
    expect(handoffLeaveDelay(1000, 1000)).toBe(HANDOFF_MIN_MS);
    expect(handoffLeaveDelay(1000, 1200)).toBe(HANDOFF_MIN_MS - 200);
  });
  it('only waits the short settle beat once the minimum has already passed', () => {
    expect(handoffLeaveDelay(0, 2500)).toBe(HANDOFF_SETTLE_MS);
    expect(handoffLeaveDelay(0, HANDOFF_MIN_MS)).toBe(HANDOFF_SETTLE_MS);
  });
  it('never exceeds the minimum and the failsafe stays above it', () => {
    expect(handoffLeaveDelay(5000, 4000)).toBeLessThanOrEqual(HANDOFF_MIN_MS + 1000);
    expect(HANDOFF_MAX_MS).toBeGreaterThan(HANDOFF_MIN_MS);
  });
});

describe('firstNameFromAuthUser', () => {
  it('prefers first_name / given_name', () => {
    expect(firstNameFromAuthUser({ user_metadata: { first_name: ' Ama ' } })).toBe('Ama');
    expect(firstNameFromAuthUser({ user_metadata: { given_name: 'Kofi', name: 'Other Person' } })).toBe('Kofi');
  });
  it('falls back to the first word of full_name / name', () => {
    expect(firstNameFromAuthUser({ user_metadata: { full_name: 'Efua Mensah Boateng' } })).toBe('Efua');
    expect(firstNameFromAuthUser({ user_metadata: { name: 'Yaw' } })).toBe('Yaw');
  });
  it('returns null for missing, blank or non-string values', () => {
    expect(firstNameFromAuthUser(null)).toBeNull();
    expect(firstNameFromAuthUser({})).toBeNull();
    expect(firstNameFromAuthUser({ user_metadata: { first_name: '   ', name: 42 } })).toBeNull();
  });
});
