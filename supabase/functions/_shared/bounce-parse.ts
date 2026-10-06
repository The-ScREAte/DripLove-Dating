// Reads bounce messages ("Undelivered Mail Returned to Sender", "Delivery
// Status Notification (Failure)") that come back to our sending mailboxes.
// Private Email - like most mail servers - accepts every email first and only
// reports a bad address minutes later by mailing a bounce back, so this is the
// only way to learn about those failures. Plain functions, no Deno APIs, so
// the vitest suite can cover them.

export interface ParsedBounce {
  recipients: string[];
  /** Enhanced status code, e.g. "5.1.1". */
  status: string | null;
  diagnostic: string | null;
  /** false for "still trying" notices (Action: delayed) - nothing to do yet. */
  final: boolean;
}

const BOUNCE_SENDER = /^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@/i;
const BOUNCE_SUBJECT = /undeliver|undelivered|delivery status notification|delivery (has )?failed|delivery failure|failure notice|returned mail|could not be delivered|couldn't be delivered|not delivered|mail delivery failed/i;

/** Cheap check on the envelope before downloading the whole message. */
export const looksLikeBounce = (from: string, subject: string): boolean =>
  BOUNCE_SENDER.test((from || '').trim()) || BOUNCE_SUBJECT.test(subject || '');

const EMAIL = /[^\s<>;:"',()[\]]+@[^\s<>;:"',()[\]]+\.[a-z0-9-]{2,}/i;

const cleanAddress = (value: string): string | null => {
  const match = value.match(EMAIL);
  return match ? match[0].replace(/\.$/, '').toLowerCase() : null;
};

const fieldValues = (unfolded: string, name: string): string[] => {
  const re = new RegExp(`^${name}:[ \\t]*(.+)$`, 'gim');
  return Array.from(unfolded.matchAll(re), (m) => m[1].trim());
};

export function parseBounce(raw: string): ParsedBounce | null {
  // Header-style fields can wrap onto indented continuation lines.
  const unfolded = String(raw || '').replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, ' ');

  const recipients = new Set<string>();
  for (const value of fieldValues(unfolded, 'X-Failed-Recipients')) {
    value.split(',').map(cleanAddress).forEach((a) => a && recipients.add(a));
  }
  const finals = fieldValues(unfolded, 'Final-Recipient');
  const originals = finals.length > 0 ? [] : fieldValues(unfolded, 'Original-Recipient');
  for (const value of [...finals, ...originals]) {
    const address = cleanAddress(value.replace(/^rfc822\s*;/i, ''));
    if (address) recipients.add(address);
  }
  if (recipients.size === 0) return null;

  const actions = fieldValues(unfolded, 'Action').map((a) => a.toLowerCase());
  const final = actions.length === 0 ? true : actions.some((a) => a.startsWith('failed'));

  const statusField = fieldValues(unfolded, 'Status').find((v) => /^[245]\.\d{1,3}\.\d{1,3}/.test(v));
  const status = statusField ? statusField.match(/^[245]\.\d{1,3}\.\d{1,3}/)![0] : null;
  const diagnosticField = fieldValues(unfolded, 'Diagnostic-Code')[0];
  const diagnostic = diagnosticField ? diagnosticField.replace(/^smtp\s*;\s*/i, '').slice(0, 500) : null;

  return { recipients: Array.from(recipients), status, diagnostic, final };
}
