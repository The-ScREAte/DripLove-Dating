import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Lock, Send, Shuffle } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useBackClose } from '@/utils/backStack';
import { loadQuota, sendIcebreaker, useIcebreakerAvailable, useIcebreakerQuota } from '@/services/icebreaker';
import { formatRenews, msUntil } from '@/utils/icebreaker';
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

type Mode = 'compose' | 'sent' | 'renewing' | 'matched';

/** How long the brief "Sent" confirmation stays before the chat opens. */
const SENT_TO_CHAT_MS = 900;

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

/**
 * The composer: who it's for, a few short ideas, a text box, one Send button. A sent hello IS the first message of a
 * normal chat, so after a short "Sent" the sheet closes and that chat opens.
 */
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
  // Backend not reachable as a feature (migration missing): the composer stays readable but Send is switched off with a
  // calm one-line note. Nothing is copied or faked.
  const unavailable = useIcebreakerAvailable() === false;

  // A fresh quota when the sheet opens; if it is already used up, go straight to the upsell.
  useEffect(() => {
    let alive = true;
    void loadQuota(true).then((q) => {
      if (alive && q && q.remaining !== null && q.remaining <= 0) setMode('renewing');
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

  // The chat the hello opened (null = nothing to open, e.g. a hello that was already waiting).
  const [chatId, setChatId] = useState<string | null>(null);
  const openTheChat = (matchId: string | null) => {
    closeIcebreaker();
    getIcebreakerHandlers().openChat(matchId);
  };
  // After a brief "Sent" the sheet closes on its own and, when there is one, the new chat opens.
  useEffect(() => {
    if (mode !== 'sent') return undefined;
    const id = window.setTimeout(() => (chatId ? openTheChat(chatId) : closeIcebreaker()), chatId ? SENT_TO_CHAT_MS : 1600);
    return () => window.clearTimeout(id);
  }, [mode, chatId]);

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
    if (sending || !draft.canSend || unavailable) return;
    setSending(true);
    setError(null);
    const res = await sendIcebreaker(target.id, sanitizeIcebreaker(text));
    setSending(false);
    // missing: `unavailable` flips to true on its own and the button turns into the "not available" state
    if (res.kind === 'missing') return;
    if (res.kind === 'ok') {
      setChatId(res.matchId);
      setMode('sent');
      return;
    }
    if (res.kind === 'already_matched') {
      // Already talking: go straight to that chat.
      if (res.matchId) openTheChat(res.matchId);
      else setMode('matched');
      return;
    }
    const key = sendErrorKey(res.code);
    if (key === 'quota_exhausted' || key === 'daily_limit') {
      void loadQuota(true);
      setMode('renewing');
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
        return t('icebreaker.errors.rateLimited', 'Too many at once. Try again shortly.');
      case 'daily_limit':
        return t('icebreaker.errors.dailyLimit', "You've used this week's icebreakers.");
      case 'invalid_message':
        return t('icebreaker.errors.invalid', 'Please write a short message (up to {{max}} characters).', { max: ICEBREAKER_MAX_LEN });
      case 'unavailable':
        return t('icebreaker.errors.unavailable', "This person can't get hellos right now.");
      default:
        return t('icebreaker.errors.generic', "Couldn't send. Try again.");
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
          {t('icebreaker.sheet.title', 'Say hi to {{name}}', { name })}
        </SheetDescription>

        {mode === 'compose' && (
          <div className="ice-body ice-compose">
            <div className="ice-head">
              <Avatar name={name} photoUrl={target.photoUrl} size={44} />
              <div className="ice-head-text">
                <h2 className="ice-to" dir="auto">
                  {t('icebreaker.sheet.title', 'Say hi to {{name}}', { name })}
                </h2>
                <p className="ice-head-sub" dir="auto">
                  {t('icebreaker.sheet.sub', 'It starts a chat. {{name}} has 24 hours to reply.', { name })}
                </p>
              </div>
              {!unavailable && <ChancesPill quota={shownQuota} />}
            </div>

            <div className="ice-ideas" role="group" aria-labelledby="ice-ideas-label">
              <div className="ice-ideas-head">
                <span id="ice-ideas-label" className="ice-ideas-label">{t('icebreaker.sheet.ideas', 'Ideas')}</span>
                <button type="button" className="ice-more dl-focus" onClick={() => setRound((r) => r + 1)}>
                  <Shuffle aria-hidden="true" />
                  <span>{t('icebreaker.sheet.more', 'More ideas')}</span>
                </button>
              </div>
              <div className="ice-openers">
                {openers.map((line) => (
                  <button
                    key={line}
                    type="button"
                    className="ice-opener dl-focus"
                    data-on={picked === line ? 'true' : undefined}
                    aria-pressed={picked === line}
                    onClick={() => pick(line)}
                    dir="auto"
                  >
                    {line}
                  </button>
                ))}
              </div>
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
                placeholder={t('icebreaker.sheet.placeholder', 'Write your first message…')}
                aria-label={t('icebreaker.sheet.placeholder', 'Write your first message…')}
                aria-invalid={error ? true : undefined}
                className="ice-textarea"
              />
              <span className={`ice-count ${draft.nearLimit ? 'ice-count-warn' : ''}`} aria-hidden="true">
                {draft.length}/{ICEBREAKER_MAX_LEN}
              </span>
            </div>

            {(unavailable || error) && (
              <p className={unavailable ? 'ice-error ice-error-calm' : 'ice-error'} role={unavailable ? 'status' : 'alert'}>
                {unavailable ? t('icebreaker.notAvailable', 'Not available yet. Try again later.') : errorText(error as string)}
              </p>
            )}

            <Button variant="primary" size="lg" className="w-full" loading={sending} disabled={!draft.canSend || unavailable} onClick={send}>
              <Send className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>{sending ? t('icebreaker.sheet.sending', 'Sending…') : t('icebreaker.sheet.send', 'Send')}</span>
            </Button>
          </div>
        )}

        {mode === 'sent' && (
          <div className="ice-body ice-center" role="status" aria-live="polite">
            <span className="ice-success" aria-hidden="true">
              <Check strokeWidth={3} />
            </span>
            <h2 className="ice-big">{t('icebreaker.sheet.sentTitle', 'Sent')}</h2>
            <p className="ice-sub" dir="auto">
              {chatId
                ? t('icebreaker.sheet.sentBody', 'Opening your chat with {{name}}…', { name })
                : t('icebreaker.sheet.sentBodyPlain', '{{name}} has 24 hours to reply.', { name })}
            </p>
          </div>
        )}

        {mode === 'renewing' && (
          <div className="ice-body ice-center">
            <span className="ice-lock" aria-hidden="true">
              <Lock />
            </span>
            <h2 className="ice-big">{t('icebreaker.renewing.title', 'All {{limit}} used this week', { limit: quota?.limit ?? 10 })}</h2>
            <p className="ice-sub">
              {quota?.resetsAt && msUntil(quota.resetsAt) > 0
                ? t('icebreaker.renewing.body', '{{limit}} new hellos in {{time}}.', { limit: quota?.limit ?? 10, time: formatRenews(msUntil(quota.resetsAt)) })
                : t('icebreaker.renewing.bodyNoTime', '{{limit}} new hellos every 7 days.', { limit: quota?.limit ?? 10 })}
            </p>
            <Button variant="primary" size="lg" className="w-full" onClick={closeIcebreaker}>
              {t('icebreaker.renewing.ok', 'Got it')}
            </Button>
          </div>
        )}

        {mode === 'matched' && (
          <div className="ice-body ice-center">
            <h2 className="ice-big">{t('icebreaker.matched.title', "You're already chatting")}</h2>
            <p className="ice-sub">{t('icebreaker.matched.body', 'Say hi in your chat.')}</p>
            <Button variant="primary" size="lg" className="w-full" onClick={() => openTheChat(null)}>
              {t('icebreaker.matched.cta', 'Open chat')}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default IcebreakerSheet;
