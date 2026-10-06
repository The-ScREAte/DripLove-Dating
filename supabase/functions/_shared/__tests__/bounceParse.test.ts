import { describe, it, expect } from 'vitest';
import { looksLikeBounce, parseBounce } from '../bounce-parse';
import { classifyEmailError } from '../email-utils';

const postfixBounce = [
  'From: MAILER-DAEMON@mta-07.privateemail.com (Mail Delivery System)',
  'Subject: Undelivered Mail Returned to Sender',
  'Content-Type: multipart/report; report-type=delivery-status;',
  '\tboundary="ABC"',
  '',
  '--ABC',
  'Content-Type: text/plain',
  '',
  'This is the mail system at host mta-07.privateemail.com.',
  '',
  '--ABC',
  'Content-Type: message/delivery-status',
  '',
  'Reporting-MTA: dns; mta-07.privateemail.com',
  '',
  'Final-Recipient: rfc822; Someone.Gone@example.com',
  'Original-Recipient: rfc822;someone.gone@example.com',
  'Action: failed',
  'Status: 5.1.1',
  'Remote-MTA: dns; mx.example.com',
  'Diagnostic-Code: smtp; 550 5.1.1 <someone.gone@example.com>: Recipient address',
  '    rejected: User unknown in virtual mailbox table',
  '',
  '--ABC',
  'Content-Type: text/rfc822-headers',
  '',
  'From: DripLove <info@driplove.love>',
  'To: someone.gone@example.com',
  '--ABC--',
].join('\r\n');

const gmailBounce = [
  'From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
  'X-Failed-Recipients: nobody.here@gmail.com',
  'Subject: Delivery Status Notification (Failure)',
  '',
  "Address not found. Your message wasn't delivered to nobody.here@gmail.com because the address couldn't be found.",
].join('\n');

const delayedNotice = [
  'Final-Recipient: rfc822; slow@example.org',
  'Action: delayed',
  'Status: 4.4.1',
  'Diagnostic-Code: smtp; 421 4.4.1 Connection timed out',
].join('\n');

describe('looksLikeBounce', () => {
  it('spots bounce senders and subjects', () => {
    expect(looksLikeBounce('MAILER-DAEMON@mta-07.privateemail.com', 'anything')).toBe(true);
    expect(looksLikeBounce('someone@x.com', 'Undelivered Mail Returned to Sender')).toBe(true);
    expect(looksLikeBounce('friend@x.com', 'Hello from DripLove')).toBe(false);
  });
});

describe('parseBounce', () => {
  it('reads a standard delivery report', () => {
    const bounce = parseBounce(postfixBounce)!;
    expect(bounce.recipients).toEqual(['someone.gone@example.com']);
    expect(bounce.status).toBe('5.1.1');
    expect(bounce.final).toBe(true);
    expect(bounce.diagnostic).toContain('User unknown');
    expect(classifyEmailError(`${bounce.status} ${bounce.diagnostic}`)).toBe('recipient_invalid');
  });

  it('reads a Gmail bounce without a delivery report part', () => {
    const bounce = parseBounce(gmailBounce)!;
    expect(bounce.recipients).toEqual(['nobody.here@gmail.com']);
    expect(bounce.final).toBe(true);
  });

  it('treats "still trying" notices as not final', () => {
    expect(parseBounce(delayedNotice)!.final).toBe(false);
  });

  it('ignores ordinary mail', () => {
    expect(parseBounce('From: a@b.com\nTo: info@driplove.love\n\nHi there')).toBeNull();
  });
});
