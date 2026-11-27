import { describe, it, expect } from 'vitest';
import {
  getGroupFlags,
  startsNewDay,
  isEmojiOnly,
  splitLinks,
  previewText,
  formatListTime,
  GROUP_GAP_MS,
} from '../chatFormat';

const msg = (sender: string, at: string) => ({ sender_id: sender, created_at: at });

describe('getGroupFlags', () => {
  it('groups same-sender messages that are close together', () => {
    const m = [
      msg('a', '2026-01-01T10:00:00Z'),
      msg('a', '2026-01-01T10:01:00Z'),
      msg('a', '2026-01-01T10:02:00Z'),
    ];
    expect(getGroupFlags(m, 0)).toEqual({ isConsecutive: false, isLastInGroup: false, isFirstInGroup: true });
    expect(getGroupFlags(m, 1)).toEqual({ isConsecutive: true, isLastInGroup: false, isFirstInGroup: false });
    expect(getGroupFlags(m, 2)).toEqual({ isConsecutive: true, isLastInGroup: true, isFirstInGroup: false });
  });

  it('breaks the group on a different sender or a long gap', () => {
    const m = [
      msg('a', '2026-01-01T10:00:00Z'),
      msg('b', '2026-01-01T10:00:30Z'),
      msg('b', new Date(Date.parse('2026-01-01T10:00:30Z') + GROUP_GAP_MS).toISOString()),
    ];
    expect(getGroupFlags(m, 0).isLastInGroup).toBe(true);
    expect(getGroupFlags(m, 1).isConsecutive).toBe(false);
    expect(getGroupFlags(m, 1).isLastInGroup).toBe(true);
    expect(getGroupFlags(m, 2).isConsecutive).toBe(false);
  });

  it('falls back to sent_at and treats a lone message as a whole group', () => {
    const m = [{ sender_id: 'a', sent_at: '2026-01-01T10:00:00Z' }];
    expect(getGroupFlags(m, 0)).toEqual({ isConsecutive: false, isLastInGroup: true, isFirstInGroup: true });
  });
});

describe('startsNewDay', () => {
  it('is true for the first message and when the calendar day changes', () => {
    const a = msg('a', '2026-01-01T12:00:00');
    const b = msg('a', '2026-01-01T13:00:00');
    const c = msg('a', '2026-01-02T12:00:00');
    expect(startsNewDay(undefined, a)).toBe(true);
    expect(startsNewDay(a, b)).toBe(false);
    expect(startsNewDay(b, c)).toBe(true);
  });
});

describe('isEmojiOnly', () => {
  it('detects 1-3 emoji only', () => {
    expect(isEmojiOnly('😂')).toBe(true);
    expect(isEmojiOnly('❤️ 😍')).toBe(true);
    expect(isEmojiOnly('👍🏽')).toBe(true);
    expect(isEmojiOnly('😂😂😂😂')).toBe(false);
    expect(isEmojiOnly('hi 😂')).toBe(false);
    expect(isEmojiOnly('')).toBe(false);
    expect(isEmojiOnly(null)).toBe(false);
    expect(isEmojiOnly('123')).toBe(false);
  });
});

describe('splitLinks', () => {
  it('returns plain text untouched', () => {
    expect(splitLinks('hello there')).toEqual([{ type: 'text', value: 'hello there' }]);
  });

  it('extracts http(s) links and keeps trailing punctuation as text', () => {
    const parts = splitLinks('see https://example.com/a?b=1, ok');
    expect(parts).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', value: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { type: 'text', value: ', ok' },
    ]);
  });

  it('never turns javascript:/data: into a link', () => {
    expect(splitLinks('javascript:alert(1) data:text/html,x')).toEqual([
      { type: 'text', value: 'javascript:alert(1) data:text/html,x' },
    ]);
  });

  it('rejects malformed urls', () => {
    expect(splitLinks('http://')).toEqual([{ type: 'text', value: 'http://' }]);
  });
});

describe('previewText', () => {
  it('collapses whitespace and newlines', () => {
    expect(previewText('  hi\n\nthere   you ')).toBe('hi there you');
    expect(previewText(undefined)).toBe('');
  });
});

describe('formatListTime', () => {
  const now = new Date(2026, 5, 15, 14, 0, 0);
  it('shows the time for today', () => {
    expect(formatListTime(new Date(2026, 5, 15, 9, 5).toISOString(), now, 'en-US', 'Yesterday')).toMatch(/9:05/);
  });
  it('shows the label for yesterday', () => {
    expect(formatListTime(new Date(2026, 5, 14, 23, 0).toISOString(), now, 'en-US', 'Yesterday')).toBe('Yesterday');
  });
  it('shows a weekday within the week and a date after that', () => {
    expect(formatListTime(new Date(2026, 5, 12, 10, 0).toISOString(), now, 'en-US', 'Yesterday')).toBe('Fri');
    expect(formatListTime(new Date(2026, 4, 1, 10, 0).toISOString(), now, 'en-US', 'Yesterday')).toBe('May 1');
  });
  it('is empty for missing/invalid input', () => {
    expect(formatListTime(null, now, 'en-US', 'Yesterday')).toBe('');
    expect(formatListTime('nope', now, 'en-US', 'Yesterday')).toBe('');
  });
});
