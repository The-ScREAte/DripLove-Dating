// Emails for people the push couldn't reach (no app, notifications blocked,
// or the push failed). Only the inner content is built here - the queue wraps
// it in the shared DripLove layout (buildDripLoveHtml) with the recipient's
// own unsubscribe link at send time.
//
// Kept deliberately plain: no ALL CAPS, no emoji in the subject, one clear
// button, a real text version - all things spam filters reward. Who liked
// someone is a Premium feature, so likes never name anyone, and message
// emails never include what was written.

import { APP_URL, escapeHtml } from './email-utils.ts';

export interface LikeMatchEmailInput {
  firstName?: string | null;
  likeCount: number;
  matchCount: number;
  /** First names of new matches, when known. */
  matchNames?: string[];
  messageCount?: number;
  /** First names of people who sent messages, when known. */
  messageNames?: string[];
  /** Account notices (e.g. a photo that needs changing): the push's own text. */
  notices?: Array<{ title: string; body?: string | null }>;
}

export interface ComposedEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

const tidyName = (name?: string | null): string => {
  const trimmed = String(name ?? '').trim().split(/\s+/)[0] ?? '';
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const stripEmoji = (value: string) =>
  value.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();

const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

const button = (url: string, label: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;">
  <tr>
    <td style="border-radius:999px;background:#9333ea;">
      <a href="${url}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:999px;">${label}</a>
    </td>
  </tr>
</table>`;

const paragraph = (html: string, last = false) =>
  `<p style="margin:0 0 ${last ? 20 : 12}px 0;font-size:15px;line-height:1.7;color:#1f2937;">${html}</p>`;

export function composeLikeMatchEmail(input: LikeMatchEmailInput): ComposedEmail {
  const likes = Math.max(0, Math.floor(input.likeCount || 0));
  const matches = Math.max(0, Math.floor(input.matchCount || 0));
  const messages = Math.max(0, Math.floor(input.messageCount || 0));
  const notices = (input.notices || []).filter((n) => n && n.title);
  const firstName = tidyName(input.firstName);
  const matchName = matches === 1 ? tidyName(input.matchNames?.[0]) : '';
  const senders = Array.from(new Set((input.messageNames || []).map(tidyName).filter(Boolean)));

  const likesTail = likes > 0
    ? ` And ${likes} ${plural(likes, 'more person', 'more people')} liked your profile.`
    : '';

  // What people wrote is never put in an email - just who and how many.
  const messageLine = (): string => {
    if (senders.length === 1) {
      return messages > 1 ? `${senders[0]} sent you ${messages} messages.` : `${senders[0]} sent you a message.`;
    }
    if (senders.length > 1) return `You have ${messages} new messages from ${listNames(senders)}.`;
    return `You have ${messages} new ${plural(messages, 'message', 'messages')}.`;
  };

  let subject: string;
  let preheader: string;
  let headlineHtml: string;
  let headlineText: string;
  let cta: string;
  let url: string;
  const extraHtml: string[] = [];
  const extraText: string[] = [];

  if (matches > 0) {
    url = `${APP_URL}/?tab=chat`;
    cta = 'Say hello';
    if (matchName) {
      subject = likes > 0
        ? `You matched with ${matchName} - and ${likes} new ${plural(likes, 'like', 'likes')} on DripLove`
        : `You matched with ${matchName} on DripLove`;
      preheader = `Say hello to ${matchName} while it's fresh.`;
      headlineHtml = `You and <strong>${escapeHtml(matchName)}</strong> liked each other - it's a match! Say hello while it's fresh.${escapeHtml(likesTail)}`;
      headlineText = `You and ${matchName} liked each other - it's a match! Say hello while it's fresh.${likesTail}`;
    } else {
      const label = matches === 1 ? 'a new match' : `${matches} new matches`;
      subject = likes > 0
        ? `You have ${label} and ${likes} new ${plural(likes, 'like', 'likes')} on DripLove`
        : `You have ${label} on DripLove`;
      preheader = 'Say hello while it\'s fresh.';
      headlineHtml = `You have <strong>${escapeHtml(label)}</strong> waiting. Say hello while it's fresh.${escapeHtml(likesTail)}`;
      headlineText = `You have ${label} waiting. Say hello while it's fresh.${likesTail}`;
    }
    if (messages > 0) {
      extraHtml.push(escapeHtml(messageLine()));
      extraText.push(messageLine());
    }
  } else if (messages > 0) {
    url = `${APP_URL}/?tab=chat`;
    cta = 'Read and reply';
    subject = senders.length === 1
      ? (messages > 1 ? `${senders[0]} sent you ${messages} messages on DripLove` : `${senders[0]} sent you a message on DripLove`)
      : `You have ${messages} new ${plural(messages, 'message', 'messages')} on DripLove`;
    preheader = 'Open DripLove to read and reply.';
    headlineText = `${messageLine()} Open DripLove to read and reply.${likesTail}`;
    headlineHtml = escapeHtml(headlineText);
  } else if (likes > 0) {
    url = `${APP_URL}/?tab=liked`;
    cta = 'See who likes you';
    if (likes === 1) {
      subject = 'Someone new liked your DripLove profile';
      preheader = 'Open DripLove to see if it\'s mutual.';
      headlineHtml = 'Someone new liked your profile. Open DripLove to see if it\'s mutual.';
      headlineText = headlineHtml;
    } else {
      subject = `${likes} people liked your DripLove profile`;
      preheader = 'Open DripLove to see who\'s interested.';
      headlineHtml = `<strong>${likes} people</strong> liked your profile. Open DripLove to see who's interested.`;
      headlineText = `${likes} people liked your profile. Open DripLove to see who's interested.`;
    }
  } else {
    url = APP_URL;
    cta = 'Open DripLove';
    const first = notices[0] ?? { title: 'An update from DripLove', body: '' };
    subject = stripEmoji(first.title) || 'An update from DripLove';
    preheader = stripEmoji(first.body || '') || 'Open DripLove for details.';
    headlineText = first.body ? String(first.body) : 'Open DripLove for details.';
    headlineHtml = escapeHtml(headlineText);
    notices.shift();
  }

  // Any account notices that weren't the main subject.
  for (const notice of notices) {
    const line = `${stripEmoji(notice.title)}${notice.body ? ` - ${notice.body}` : ''}`;
    extraHtml.push(escapeHtml(line));
    extraText.push(line);
  }

  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const footnote = 'Reply from the DripLove app. Deleted it? Get it again from the App Store or Google Play and log in with this email address.';

  const html = [
    paragraph(escapeHtml(greeting)),
    paragraph(headlineHtml, extraHtml.length === 0),
    ...extraHtml.map((line, i) => paragraph(line, i === extraHtml.length - 1)),
    button(url, cta),
    `<p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">${footnote}</p>`,
  ].join('\n').trim();

  const text = [greeting, '', headlineText, ...extraText.flatMap((l) => ['', l]), '', `${cta}: ${url}`, '', footnote].join('\n');

  return { subject, preheader, html, text };
}

/**
 * The email copy of an admin push broadcast, for people the push couldn't
 * reach. The push title becomes the subject; its text the body.
 */
export function composeBroadcastEmail(title: string, message: string): { subject: string; preheader: string; html: string } {
  const subject = stripEmoji(String(title || '')) || 'News from DripLove';
  const body = String(message || '').trim();
  const bodyHtml = escapeHtml(body).replace(/\r?\n/g, '<br>');
  return {
    subject,
    preheader: stripEmoji(body).slice(0, 120) || subject,
    html: [paragraph(bodyHtml, true), button(APP_URL, 'Open DripLove')].join('\n').trim(),
  };
}
