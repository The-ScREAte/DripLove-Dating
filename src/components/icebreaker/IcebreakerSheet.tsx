import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Lock, MessageCircleHeart, Shuffle } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useBackClose } from '@/utils/backStack';
import { getCachedStatus, loadQuota, sendIcebreaker, useIcebreakerAvailable, useIcebreakerQuota } from '@/services/icebreaker';
import { copyToClipboard } from '@/utils/copyToClipboard';
import { ChancesPill } from './ChancesPill';
import { useChances } from './useChances';
import {
  ICEBREAKER_MAX_LEN,
  icebreakerDraftState,
  openerLines,
  freestyleLines,
  sanitizeIcebreaker,
  sendErrorKey,
} from '@/utils/icebreaker';
import { closeIcebreaker, getIcebreakerHandlers, type IcebreakerTarget } from './store';
import './icebreaker.css';

type Mode = 'compose' | 'sent' | 'upsell' | 'matched';

const canHover = (): boolean => {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
};

export const Avatar: React.FC<{ name: string; photoUrl?: string | null; size?: number }> = ({ name, photoUrl, size = 44 }) => {
  const [failed, setFailed] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <span className="ice-avatar" style={{ width: size, height: size }} aria-hidden="true">
      {photoUrl && !failed ? (
        <img src={photoUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span className="ice-avatar-initial" style={{ fontSize: size * 0.42 }}>
          {initial}
        </span>
      )}
    </span>
  );
};

interface Props {
  target: IcebreakerTarget;
}

/** The composer: friendly openers, a short text box, one send button. Opened for one person. */
const IcebreakerSheet: React.FC<Props> = ({ target }) => {
  const { t } = useTranslation();
  const quota = useIcebreakerQuota();
  const tr = useMemo(
    () => (key: string, fallback: string, options?: Record<string, unknown>) => t(key, { defaultValue: fallback, ...(options || {}) }) as string,
    [t]
  );
  // "more ideas": 0 = the personal + free-style mix for this person, then rounds of free-style lines
  const [round, setRound] = useState(0);
  const openers = useMemo(
    () => (round === 0 ? openerLines(target.starters, target.name, tr) : freestyleLines(3, round - 1, target.name, tr)),
    [round, target.starters, target.name, tr]
  );
  const shownQuota = useChances();

  const [text, setText] = useState(target.prefill || '');
  const [mode, setMode] = useState<Mode>('compose');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(target.prefill || null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  const draft = icebreakerDraftState(text);
  // Backend not applied yet: the popup still works as a message helper - "Copy message" instead of Send.
  const unavailable = useIcebreakerAvailable() === false;
  const [copied, setCopied] = useState(false);

  // A fresh quota when the sheet opens; if it is already used up, go straight to the upsell.
  useEffect(() => {
    let alive = true;
    void loadQuota(true).then((q) => {
      if (alive && q && !q.isPremium && q.remaining !== null && q.remaining <= 0) setMode('upsell');
    });
    return () => {
      alive = false;
    };
  }, [target.id]);

  // Desktop: focus straight away. A tapped/default opener is already in the box: focus with the
  // caret at the END so it can be edited (or sent as-is) immediately, on phones too. Runs from the
  // dialog's own open hook because the textarea only exists once the sheet content has mounted.
  const focusComposer = () => {
    const el = areaRef.current;
    if (!el) return;
    if (target.prefill) {
      el.focus({ preventScroll: true });
      const n = el.value.length;
      el.setSelectionRange(n, n);
    } else if (canHover()) {
      el.focus();
    }
  };

  // After "Sent!" the sheet closes on its own (the button on the card then reads "Icebreaker sent").
  useEffect(() => {
    if (mode !== 'sent') return undefined;
    const id = window.setTimeout(closeIcebreaker, 1900);
    return () => window.clearTimeout(id);
  }, [mode]);

  useBackClose(true, closeIcebreaker, { escape: false });

  const pick = (line: string) => {
    setPicked(line);
    setText(line);
    setError(null);
    // Move the caret to the end so the person can keep typing.
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(line.length, line.length);
    });
  };

  const send = async () => {
    if (sending || !draft.canSend) return;
    if (unavailable) {
      const ok = await copyToClipboard(sanitizeIcebreaker(text));
      setCopied(ok);
      if (ok) window.setTimeout(() => setCopied(false), 2200);
      return;
    }
    setSending(true);
    setError(null);
    const res = await sendIcebreaker(target.id, sanitizeIcebreaker(text));
    setSending(false);
    if (res.kind === 'missing') {
      closeIcebreaker();
      return;
    }
    if (res.kind === 'ok') {
      setMode('sent');
      return;
    }
    if (res.kind === 'already_matched') {
      setMode('matched');
      return;
    }
    const key = sendErrorKey(res.code);
    if (key === 'quota_exhausted') {
      setMode('upsell');
      return;
    }
    if (key === 'already_matched') {
      setMode('matched');
      return;
    }
    if (key === 'already_sent') {
      setMode('sent');
      return;
    }
    setError(key);
  };

  const errorText = (key: string): string => {
    switch (key) {
      case 'rate_limited':
        return t('icebreaker.errors.rateLimited', "You're sending a lot of icebreakers - try again in a little while.");
      case 'daily_limit':
        return t('icebreaker.errors.dailyLimit', "You've reached today's icebreaker limit. Try again tomorrow.");
      case 'invalid_message':
        return t('icebreaker.errors.invalid', 'Please write a short message (up to {{max}} characters).', { max: ICEBREAKER_MAX_LEN });
      case 'unavailable':
        return t('icebreaker.errors.unavailable', "This person can't receive icebreakers right now.");
      default:
        return t('icebreaker.errors.generic', "Couldn't send that - please try again.");
    }
  };

  const name = target.name || '';

  return (
    <Sheet open onOpenChange={(o) => !o && closeIcebreaker()}>
      <SheetContent side="bottom" className="ice-sheet" aria-describedby="ice-sheet-desc" onOpenAutoFocus={(e) => {
          e.preventDefault();
          focusComposer();
        }}>
        <div className="ice-grab" aria-hidden="true" />
        <SheetTitle className="sr-only">{t('icebreaker.title', 'Break the ice')}</SheetTitle>
        <SheetDescription id="ice-sheet-desc" className="sr-only">
          {t('icebreaker.sheet.title', 'Be the first to say hi')}
        </SheetDescription>

        {mode === 'compose' && (
          <div className="ice-body ice-lean">
            <div className="ice-top">
              <h2 className="ice-to" dir="auto">
                {t('icebreaker.sheet.title', 'Be the first to say hi')}
              </h2>
              <ChancesPill quota={shownQuota} />
            </div>

            <div className="ice-openers" role="group" aria-label={t('icebreaker.sheet.ideas', 'Need an idea?')}>
              {openers.map((line) => (
                <button
                  key={line}
                  type="button"
                  className="ice-opener dl-focus dl-press"
                  data-on={picked === line ? 'true' : undefined}
                  aria-pressed={picked === line}
                  onClick={() => pick(line)}
                >
                  {line}
                </button>
              ))}
              <button type="button" className="ice-more dl-focus dl-press" aria-label={t('icebreaker.sheet.more', 'More ideas')} onClick={() => setRound((r) => r + 1)}>
                <Shuffle aria-hidden="true" />
              </button>
            </div>

            <div className="ice-field">
              <Textarea
                ref={areaRef}
                tone="dark"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (picked && e.target.value !== picked) setPicked(null);
                  if (error) setError(null);
                }}
                rows={3}
                maxLength={ICEBREAKER_MAX_LEN}
                placeholder={t('icebreaker.sheet.placeholder', 'Say something sweet…')}
                aria-label={t('icebreaker.sheet.placeholder', 'Say something sweet…')}
                aria-invalid={error ? true : undefined}
                className="ice-textarea"
              />
              <span className={`ice-count ${draft.nearLimit ? 'ice-count-warn' : ''}`} aria-hidden="true">
                {draft.length}/{ICEBREAKER_MAX_LEN}
              </span>
            </div>

            <p className="ice-error" role="alert" aria-live="assertive">
              {error ? errorText(error) : ''}
            </p>

            <Button variant="primary" size="lg" className="w-full" loading={sending} disabled={!draft.canSend} onClick={send}>
              <MessageCircleHeart className="h-5 w-5" aria-hidden="true" />
              <span>{sending ? t('icebreaker.sheet.sending', 'Sending…') : unavailable && copied ? t('icebreaker.copied', 'Copied') : t('icebreaker.sheet.send', 'Say hi first')}</span>
            </Button>
          </div>
        )}

        {mode === 'sent' && (
          <div className="ice-body ice-center" role="status" aria-live="polite">
            <span className="ice-success" aria-hidden="true">
              <Check strokeWidth={3} />
            </span>
            <h2 className="ice-big">{t('icebreaker.sheet.sentTitle', 'Sent!')}</h2>
            <p className="ice-sub">{t('icebreaker.sheet.sentBody', "We'll let you know if {{name}} replies.", { name })}</p>
            <Button variant="line" size="lg" className="w-full text-white" onClick={closeIcebreaker}>
              {t('icebreaker.sheet.done', 'Done')}
            </Button>
          </div>
        )}

        {mode === 'upsell' && (
          <div className="ice-body ice-center">
            <span className="ice-lock" aria-hidden="true">
              <Lock />
            </span>
            <h2 className="ice-big">
              {t('icebreaker.upsell.title', "You've used your {{limit}} free icebreakers", { limit: quota?.limit ?? 3 })}
            </h2>
            <p className="ice-sub">{t('icebreaker.upsell.body', 'Go Premium to break the ice with as many people as you like.')}</p>
            <Button
              variant="premium"
              size="lg"
              className="w-full"
              onClick={() => {
                closeIcebreaker();
                getIcebreakerHandlers().openPremium();
              }}
            >
              {t('icebreaker.upsell.cta', 'Go Premium')}
            </Button>
            <Button variant="quiet" size="md" className="w-full text-white/70" onClick={closeIcebreaker}>
              {t('icebreaker.upsell.later', 'Not now')}
            </Button>
          </div>
        )}

        {mode === 'matched' && (
          <div className="ice-body ice-center">
            <span className="ice-success" aria-hidden="true">
              <MessageCircleHeart />
            </span>
            <h2 className="ice-big">{t('icebreaker.matched.title', "You're already matched")}</h2>
            <p className="ice-sub">{t('icebreaker.matched.body', 'Say hi in your chat.')}</p>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => {
                closeIcebreaker();
                getIcebreakerHandlers().openChat(getCachedStatus(target.id)?.matchId);
              }}
            >
              {t('icebreaker.matched.cta', 'Open chat')}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default IcebreakerSheet;
