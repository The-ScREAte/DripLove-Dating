// The likes & matches email for people we can't reach by push (notifications
// blocked or app deleted). Only the inner content is built here - the queue
// wraps it in the shared DripLove layout (buildDripLoveHtml) with the
// recipient's own unsubscribe link at send time.
//
// Kept deliberately plain: no ALL CAPS, no emoji in the subject, one clear
// button, a real text version - all things spam filters reward. Who liked
// someone is a Premium feature, so likes never name anyone.

import { APP_URL, escapeHtml } from './email-utils.ts';

export interface LikeMatchEmailInput {
  firstName?: string | null;
  likeCount: number;
  matchCount: number;
  /** First names of new matches, when known. */
  matchNames?: string[];
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

export function composeLikeMatchEmail(input: LikeMatchEmailInput): ComposedEmail {
  const likes = Math.max(0, Math.floor(input.likeCount || 0));
  const matches = Math.max(0, Math.floor(input.matchCount || 0));
  const firstName = tidyName(input.firstName);
  const matchName = matches === 1 ? tidyName(input.matchNames?.[0]) : '';

  let subject: string;
  let preheader: string;
  let headlineHtml: string;
  let headlineText: string;
  let cta: string;
  let url: string;

  if (matches > 0) {
    url = `${APP_URL}/?tab=chat`;
    cta = 'Say hello';
    const likesTail = likes > 0
      ? ` And ${likes} ${plural(likes, 'more person', 'more people')} liked your profile.`
      : '';
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
  } else {
    url = `${APP_URL}/?tab=liked`;
    cta = 'See who likes you';
    if (likes <= 1) {
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
  }

  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const footnote = 'Reply from the DripLove app. Deleted it? Get it again from the App Store or Google Play and log in with this email address.';

  const html = `
<p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#1f2937;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 20px 0;font-size:15px;line-height:1.7;color:#1f2937;">${headlineHtml}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;">
  <tr>
    <td style="border-radius:999px;background:#9333ea;">
      <a href="${url}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:999px;">${cta}</a>
    </td>
  </tr>
</table>
<p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">${footnote}</p>`.trim();

  const text = [greeting, '', headlineText, '', `${cta}: ${url}`, '', footnote].join('\n');

  return { subject, preheader, html, text };
}
