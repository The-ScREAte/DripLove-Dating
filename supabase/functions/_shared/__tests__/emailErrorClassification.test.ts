import { describe, it, expect } from 'vitest';
import {
  classifyEmailError,
  isPermanentEmailError,
  isTemporaryError,
  senderPauseMinutes,
} from '../email-utils';

// Real SMTP replies (Gmail and common providers). The first one is the exact
// error that used to put 2,117 good customer addresses on the do-not-send list.
describe('classifyEmailError', () => {
  const cases: Array<[string, ReturnType<typeof classifyEmailError>]> = [
    ['Data command failed: 550-5.4.5 Daily user sending limit exceeded. For more information on Gmail\n550-5.4.5 sending limits', 'sender_quota'],
    ['550 5.4.5 Daily user sending quota exceeded.', 'sender_quota'],
    ['454-4.7.0 Too many login attempts, please try again later.', 'sender_quota'],
    ['Invalid login: 535-5.7.8 Username and Password not accepted.', 'sender_auth'],
    ['534-5.7.9 Application-specific password required.', 'sender_auth'],
    ['421-4.3.0 Temporary System Problem.  Try again later (10).', 'sender_connection'],
    ['Connection timeout', 'sender_connection'],
    ['getaddrinfo ENOTFOUND smtp.gmail.com - ESOCKET', 'sender_connection'],
    ["Can't send mail - all recipients were rejected: 550-5.1.1 The email account that you tried to reach does not exist.", 'recipient_invalid'],
    ["Can't send mail - all recipients were rejected: 553-5.1.3 The recipient address <a@b> is not a valid RFC 5321 address.", 'recipient_invalid'],
    ['552-5.2.2 The email account that you tried to reach is over quota.', 'recipient_temporary'],
    ['550-5.7.1 Our system has detected that this message is likely unsolicited mail.', 'message_rejected'],
    ['550-5.7.26 This mail is unauthenticated, which poses a security risk to the sender.', 'message_rejected'],
    ['Something odd happened', 'unknown'],
  ];

  it.each(cases)('%s -> %s', (message, expected) => {
    expect(classifyEmailError(message)).toBe(expected);
  });

  it('never treats our own sending limit as a bad recipient address', () => {
    const quota = 'Data command failed: 550-5.4.5 Daily user sending limit exceeded.';
    expect(isPermanentEmailError(quota)).toBe(false);
    expect(isTemporaryError(quota)).toBe(true);
  });

  it('only suppresses addresses that really do not exist', () => {
    expect(isPermanentEmailError('550-5.1.1 The email account that you tried to reach does not exist.')).toBe(true);
    expect(isPermanentEmailError('552-5.2.2 The email account that you tried to reach is over quota.')).toBe(false);
    expect(isPermanentEmailError('550-5.7.1 likely unsolicited mail')).toBe(false);
  });
});

describe('senderPauseMinutes', () => {
  it('backs off quota pauses 6h -> 12h -> 24h and caps at 24h', () => {
    expect(senderPauseMinutes('sender_quota', 1)).toBe(360);
    expect(senderPauseMinutes('sender_quota', 2)).toBe(720);
    expect(senderPauseMinutes('sender_quota', 3)).toBe(1440);
    expect(senderPauseMinutes('sender_quota', 6)).toBe(1440);
  });

  it('retries connection problems quickly', () => {
    expect(senderPauseMinutes('sender_connection', 1)).toBe(15);
    expect(senderPauseMinutes('sender_connection', 2)).toBe(30);
  });
});
