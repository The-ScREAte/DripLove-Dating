import { describe, it, expect } from 'vitest';
import { composeLikeMatchEmail } from '../notification-email';
import {
  buildDripLoveHtml,
  buildUnsubscribeUrl,
  unsubscribeHeaders,
  verifyUnsubscribeLink,
} from '../email-utils';

describe('composeLikeMatchEmail', () => {
  it('likes only: counts people, never names them, links to Liked Me', () => {
    const email = composeLikeMatchEmail({ firstName: 'ama', likeCount: 3, matchCount: 0 });
    expect(email.subject).toBe('3 people liked your DripLove profile');
    expect(email.html).toContain('Hi Ama,');
    expect(email.html).toContain('https://www.driplove.love/?tab=liked');
    expect(email.text).toContain('See who likes you: https://www.driplove.love/?tab=liked');
  });

  it('a single like reads naturally', () => {
    const email = composeLikeMatchEmail({ firstName: null, likeCount: 1, matchCount: 0 });
    expect(email.subject).toBe('Someone new liked your DripLove profile');
    expect(email.html).toContain('Hi there,');
  });

  it('a match names the other person and links to chat', () => {
    const email = composeLikeMatchEmail({ firstName: 'Kofi', likeCount: 0, matchCount: 1, matchNames: ['ESI'] });
    expect(email.subject).toBe('You matched with Esi on DripLove');
    expect(email.html).toContain('<strong>Esi</strong>');
    expect(email.html).toContain('https://www.driplove.love/?tab=chat');
  });

  it('matches and likes together', () => {
    const email = composeLikeMatchEmail({ firstName: 'Kofi', likeCount: 2, matchCount: 2 });
    expect(email.subject).toBe('You have 2 new matches and 2 new likes on DripLove');
    expect(email.text).toContain('And 2 more people liked your profile.');
  });

  it('escapes names so profile text can never inject HTML', () => {
    const email = composeLikeMatchEmail({ firstName: '<b>x</b>', likeCount: 1, matchCount: 1, matchNames: ['<img>'] });
    expect(email.html).not.toContain('<b>x');
    expect(email.html).not.toContain('<img>');
  });

  it('messages: says who and how many, never what was written', () => {
    const one = composeLikeMatchEmail({ firstName: 'Kofi', likeCount: 0, matchCount: 0, messageCount: 2, messageNames: ['ama', 'Ama'] });
    expect(one.subject).toBe('Ama sent you 2 messages on DripLove');
    expect(one.html).toContain('https://www.driplove.love/?tab=chat');
    const many = composeLikeMatchEmail({ likeCount: 1, matchCount: 0, messageCount: 3, messageNames: ['Ama', 'Esi'] });
    expect(many.subject).toBe('You have 3 new messages on DripLove');
    expect(many.text).toContain('You have 3 new messages from Ama and Esi.');
    expect(many.text).toContain('And 1 more person liked your profile.');
  });

  it('a match email also mentions new messages', () => {
    const email = composeLikeMatchEmail({ likeCount: 0, matchCount: 1, matchNames: ['Esi'], messageCount: 1, messageNames: ['Esi'] });
    expect(email.subject).toBe('You matched with Esi on DripLove');
    expect(email.text).toContain('Esi sent you a message.');
  });

  it('account notices use the notice text, without emoji in the subject', () => {
    const email = composeLikeMatchEmail({
      likeCount: 0, matchCount: 0,
      notices: [{ title: 'Photo not approved 📸', body: 'Please upload a clear photo of your face.' }],
    });
    expect(email.subject).toBe('Photo not approved');
    expect(email.text).toContain('Please upload a clear photo of your face.');
    expect(email.html).toContain('Open DripLove');
  });

  it('keeps subjects free of emoji and shouting', () => {
    for (const input of [
      { likeCount: 5, matchCount: 0 },
      { likeCount: 0, matchCount: 3 },
      { likeCount: 1, matchCount: 1, matchNames: ['Ama'] },
    ]) {
      const { subject } = composeLikeMatchEmail(input);
      expect(subject).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(subject).not.toMatch(/[A-Z]{4,}/);
    }
  });
});

describe('unsubscribe links', () => {
  const secret = 'test-secret-value';
  const base = 'https://example.supabase.co';

  it('round-trips the address and rejects tampering', async () => {
    const url = new URL(await buildUnsubscribeUrl(base, secret, 'Ama.Mensah@Gmail.com '));
    const e = url.searchParams.get('e')!;
    const t = url.searchParams.get('t')!;
    expect(url.pathname).toBe('/functions/v1/email-unsubscribe');
    expect(await verifyUnsubscribeLink(secret, e, t)).toBe('ama.mensah@gmail.com');

    const other = new URL(await buildUnsubscribeUrl(base, secret, 'someone@else.com'));
    expect(await verifyUnsubscribeLink(secret, other.searchParams.get('e')!, t)).toBeNull();
    expect(await verifyUnsubscribeLink('another-secret', e, t)).toBeNull();
    expect(await verifyUnsubscribeLink(secret, 'not-base64!!', t)).toBeNull();
  });

  it('adds the one-click headers Gmail and Yahoo look for', () => {
    expect(unsubscribeHeaders('https://x/u')).toEqual({
      'List-Unsubscribe': '<https://x/u>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});

describe('buildDripLoveHtml', () => {
  it('keeps the DripLove layout and adds the unsubscribe footer and preview line', () => {
    const html = buildDripLoveHtml('3 people liked your DripLove profile', '<p>Body</p>', {
      preheader: 'Open DripLove to see who is interested.',
      unsubscribeUrl: 'https://x/u?e=a&t=b',
    });
    expect(html).toContain('driplove-logo.png');
    expect(html).toContain('<p>Body</p>');
    expect(html).toContain('Open DripLove to see who is interested.');
    expect(html).toContain('href="https://x/u?e=a&amp;t=b"');
    expect(html).toContain('Unsubscribe');
  });

  it('is unchanged for callers that pass no options', () => {
    const html = buildDripLoveHtml('Hello', '<p>Hi</p>');
    expect(html).not.toContain('Unsubscribe');
  });
});

describe('composeBroadcastEmail', () => {
  it('turns an admin push into a clean email', async () => {
    const { composeBroadcastEmail } = await import('../notification-email');
    const email = composeBroadcastEmail('Weekend special 🎉', 'Line one\n<b>Line two</b>');
    expect(email.subject).toBe('Weekend special');
    expect(email.html).toContain('Line one<br>&lt;b&gt;Line two&lt;/b&gt;');
    expect(email.html).toContain('Open DripLove');
  });
});
