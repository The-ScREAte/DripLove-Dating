import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { placeShort } from '@/utils/countryShort';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Briefcase,
  Dumbbell,
  GraduationCap,
  Gem,
  Heart,
  Languages,
  MapPin,
  MessageCircle,
  Mic2,
  Moon,
  Music2,
  Navigation,
  PawPrint,
  Quote,
  Ruler,
  ShieldCheck,
  Sparkles,
  Wine,
  Baby,
  Gift,
  Coffee,
  Search,
  Lightbulb,
  Cigarette,
} from 'lucide-react';
import type { InfoCard, ChipRef } from '../profile-card/infoCards';
import { CARD_PALETTES } from '../profile-card/infoCards';
import { relationshipIntentLabel } from '../profile-card/profileCardUtils';
import { GENRE_OPTIONS, VALUE_OPTIONS, vibeLabel } from '@/constants/vibe';
import MusicPlayerModal from '../MusicPlayerModal';
import IcebreakerButton from '../icebreaker/IcebreakerButton';
import { openerLines } from '@/utils/icebreaker';
import styles from './InfoCardSlide.module.css';

type Icon = React.ComponentType<{ className?: string }>;
type Tr = (key: string, fallback: string, options?: Record<string, unknown>) => string;

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

/** Scale the type to the amount of text so a short line is big and a long one still fits. */
const textSize = (len: number): string => (len <= 70 ? styles.textXl : len <= 150 ? styles.textLg : len <= 320 ? '' : styles.textSm);

/** Gentle staggered pop-in (motion tokens; reduced/lite tiers shorten or disable it). */
const popStyle = (i: number): React.CSSProperties => ({ animationDelay: `${Math.min(i, 9) * 35}ms` });

const chipText = (c: ChipRef, tr: Tr): { emoji: string; label: string } => {
  if (c.type === 'value') return { emoji: VALUE_OPTIONS.find((o) => o.id === c.id)?.emoji ?? '', label: vibeLabel('values', c.id, tr) };
  if (c.type === 'genre') return { emoji: GENRE_OPTIONS.find((o) => o.id === c.id)?.emoji ?? '', label: vibeLabel('genres', c.id, tr) };
  if (c.type === 'artist') return { emoji: '🎤', label: c.id };
  return { emoji: '', label: c.id };
};

/** Faint icons drifting behind the text: position, size, drift, tip, speed (s) and starting offset. */
const DECOR: Array<{ x: string; y: string; size: number; dx: string; dy: string; rot: string; dur: string; delay: string; op: number; spark?: boolean }> = [
  { x: '7%', y: '15%', size: 30, dx: '14px', dy: '-18px', rot: '16deg', dur: '3.6s', delay: '-1s', op: 0.16 },
  { x: '80%', y: '13%', size: 22, dx: '-12px', dy: '16px', rot: '-20deg', dur: '4.2s', delay: '-3s', op: 0.15, spark: true },
  { x: '86%', y: '60%', size: 34, dx: '-14px', dy: '-14px', rot: '14deg', dur: '4.8s', delay: '-5s', op: 0.13 },
  { x: '10%', y: '62%', size: 24, dx: '16px', dy: '14px', rot: '-16deg', dur: '3.9s', delay: '-2s', op: 0.15, spark: true },
  { x: '46%', y: '80%', size: 20, dx: '12px', dy: '-12px', rot: '-24deg', dur: '3.3s', delay: '-4s', op: 0.14 },
];

const Eyebrow: React.FC<{ icon: Icon; children: React.ReactNode }> = ({ icon: I, children }) => (
  <div className={styles.eyebrow}>
    <I />
    <span>{children}</span>
  </div>
);

const Bubbles: React.FC<{ chips: ChipRef[]; extra?: number; tr: Tr; strongFirst?: boolean }> = ({ chips, extra = 0, tr, strongFirst }) => (
  <div className={styles.chips}>
    {chips.map((c, i) => {
      const { emoji, label } = chipText(c, tr);
      const size = i % 5 === 0 ? styles.bubbleL : i % 3 === 2 ? styles.bubbleS : styles.bubble;
      return (
        <span key={`${c.type}-${c.id}`} className={cx(styles.chip, size, 'dl-pop', strongFirst && i === 0 && styles.chipStrong)} style={popStyle(i)}>
          {emoji && <span aria-hidden="true">{emoji}</span>}
          {label}
        </span>
      );
    })}
    {extra > 0 && <span className={cx(styles.chip, styles.bubbleS)}>{tr('vibe.more', '+{{count}}', { count: extra })}</span>}
  </div>
);

const FACT_ICON: Record<string, Icon> = { work: Briefcase, education: GraduationCap, height: Ruler, place: MapPin, distance: Navigation, languages: Languages };
const TRAIT_ICON: Record<string, Icon> = {
  family: Baby, love: Gift, communication: MessageCircle, exercise: Dumbbell, drinking: Wine, smoking: Cigarette, sleep: Moon, pets: PawPrint,
};
const PROMPT_ICON: Record<string, Icon> = { fun_fact: Lightbulb, perfect_first_date: Coffee, last_googled: Search };

const Rows: React.FC<{ rows: Array<{ icon: Icon; label: string; value: string }> }> = ({ rows }) => (
  <div className={styles.rows}>
    {rows.map((r, i) => (
      <div key={`${r.label}-${i}`} className={cx(styles.row, 'dl-pop')} style={popStyle(i)}>
        <span className={styles.rowIcon}><r.icon /></span>
        <div className={styles.rowText}>
          <div className={styles.rowLabel}>{r.label}</div>
          <div className={styles.rowValue}>{r.value}</div>
        </div>
      </div>
    ))}
  </div>
);

const TRAIT_LABELS: Record<string, [string, string]> = {
  exercise: ['cards.lifestyle.exercise', 'Exercise'],
  drinking: ['cards.lifestyle.drinking', 'Drinks'],
  smoking: ['cards.lifestyle.smoking', 'Smokes'],
  sleep: ['cards.lifestyle.sleep', 'Sleep'],
  pets: ['cards.lifestyle.pets', 'Pets'],
};

export interface InfoCardSlideProps {
  card: InfoCard;
}

/**
 * One designed card. The deck builder (profile-card/infoCards.ts) decides WHICH cards a profile
 * gets and in what order; this only renders a single one. Rendering never prints a missing
 * value - the builder already dropped anything empty.
 */
export const InfoCardSlide: React.FC<InfoCardSlideProps> = React.memo(({ card }) => {
  const { t } = useTranslation();
  const tr: Tr = (key, fallback, options) => t(key, { defaultValue: fallback, ...(options || {}) }) as string;
  const { data } = card;
  const palette = CARD_PALETTES[card.palette % CARD_PALETTES.length];
  const [playing, setPlaying] = useState(false);
  const name = data.name || '';

  // Fit-to-space: dense cards on short phones scale down instead of colliding with the top bar / caption.
  // Long text is handled in two steps so it never ends in a half-clipped line: first a modest shrink (down to 85%),
  // then, if it still does not fit, the text is cut at a WHOLE line with an ellipsis and a small "read more" hint
  // (the full text is in the details below the photo).
  const boxRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const el = fitRef.current;
    if (!box || !el) return undefined;
    const MIN_TEXT_ZOOM = 0.85;
    const apply = () => {
      el.style.zoom = '';
      const textEl = el.querySelector<HTMLElement>('[data-fit-text]');
      textEl?.style.removeProperty('-webkit-line-clamp'); // back to the stylesheet's default clamp
      const cs = window.getComputedStyle(box);
      const avail = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (avail <= 0) return;

      let need = el.scrollHeight;
      if (textEl && need * MIN_TEXT_ZOOM > avail) {
        const tcs = window.getComputedStyle(textEl);
        const lineH = parseFloat(tcs.lineHeight) || parseFloat(tcs.fontSize) * 1.4 || 24;
        const shownLines = Math.max(1, Math.round(textEl.clientHeight / lineH));
        for (let n = shownLines - 1; n >= 3; n -= 1) {
          textEl.style.setProperty('-webkit-line-clamp', String(n));
          need = el.scrollHeight;
          if (need * MIN_TEXT_ZOOM <= avail) break;
        }
      }

      if (need > avail) el.style.zoom = String(Math.max(0.68, avail / need));
      // (measured AFTER the shrink: scaling changes how the text wraps, so it may fit where it did not at 100%)
      // Is the text actually cut by the line clamp? Compare the full (unclamped) height with the height shown. Set as a data
      // attribute (not React state) so the hint can never go stale while the layout settles.
      let cut = false;
      if (textEl) {
        const shownH = textEl.clientHeight;
        const prevClamp = textEl.style.getPropertyValue('-webkit-line-clamp');
        textEl.style.setProperty('-webkit-line-clamp', 'unset');
        cut = textEl.scrollHeight > shownH + 2;
        if (prevClamp) textEl.style.setProperty('-webkit-line-clamp', prevClamp);
        else textEl.style.removeProperty('-webkit-line-clamp');
      }
      if (cut) el.setAttribute('data-truncated', 'true');
      else el.removeAttribute('data-truncated');
    };
    apply();
    // The first measurement can run before the card has finished laying out (fonts, the card's own size): measure again
    // on the next frame and once fonts are ready, so the "read more" hint and the fit never go stale.
    const raf = window.requestAnimationFrame(apply);
    let cancelled = false;
    void document.fonts?.ready?.then(() => { if (!cancelled) apply(); });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(box);
    window.addEventListener('resize', apply);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [card.key]);

  const intent = useMemo(
    () => (data.intent ? relationshipIntentLabel(data.intent, (k, d, o) => tr(k, d, o)) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.intent, t],
  );

  let Watermark: Icon = Sparkles;
  let body: React.ReactNode = null;
  let center = false;
  let title = '';

  switch (card.kind) {
    case 'hero': {
      Watermark = Heart;
      center = true;
      title = tr('cards.heroMeet', 'Meet {{name}}', { name });
      const where = placeShort(data.city, data.country);
      const meta = [typeof data.age === 'number' ? String(data.age) : '', where].filter(Boolean).join(' · ');
      body = (
        <>
          <div className={styles.monogram} aria-hidden="true">{data.text || (name ? name.charAt(0) : '♥')}</div>
          <h3 className={cx(styles.display, styles.displayLg)}>{title}</h3>
          {meta && <p className={styles.sub}>{meta}</p>}
          <div className={styles.chips}>
            {data.verified && (
              <span className={cx(styles.chip, styles.chipStrong)}><ShieldCheck className="w-4 h-4" aria-hidden="true" />{tr('cards.trust.verified', 'Verified profile')}</span>
            )}
            {intent && <span className={styles.chip}>{intent}</span>}
          </div>
          <p className={cx(styles.sub, styles.hint)}>{tr('cards.heroHint', 'Tap the right side of the card to see more')} →</p>
        </>
      );
      break;
    }
    case 'about': {
      Watermark = Quote;
      title = tr('discover.matchCard.aboutUser', 'About {{name}}', { name });
      const aboutFacts = (data.facts || []).map((f) => ({ icon: FACT_ICON[f.key], value: f.value }));
      body = (
        <>
          <div className={styles.quoteMark} aria-hidden="true">“</div>
          <p dir="auto" data-fit-text className={cx(styles.text, textSize((data.text || '').length))}>{data.text}</p>
          <div dir="auto" className={styles.byline}>
            — {name}
            <span className={styles.moreHint}> · {tr('cards.readMoreHint', 'tap ↓ to read more')}</span>
          </div>
          {aboutFacts.length > 0 && (
            <div className={styles.chips}>
              {aboutFacts.map((f, i) => (
                <span key={`${f.value}-${i}`} className={cx(styles.chip, 'dl-pop')} style={popStyle(i)}>
                  <f.icon className="w-4 h-4" />{f.value}
                </span>
              ))}
            </div>
          )}
        </>
      );
      break;
    }
    case 'prompt': {
      const pt = data.promptType || 'fun_fact';
      Watermark = PROMPT_ICON[pt] || Lightbulb;
      title = pt === 'fun_fact' ? tr('cards.promptFunFact', 'Fun fact') : pt === 'perfect_first_date' ? tr('cards.promptFirstDate', 'Perfect first date') : tr('cards.promptGoogled', 'Last googled');
      body = (
        <>
          <Eyebrow icon={PROMPT_ICON[pt] || Lightbulb}>{title}</Eyebrow>
          <p dir="auto" data-fit-text className={cx(styles.text, textSize((data.text || '').length))}>{data.text}</p>
        </>
      );
      break;
    }
    case 'interests': {
      Watermark = Sparkles;
      title = tr('cards.interestsTitle', 'What {{name}} is into', { name });
      body = (
        <>
          <Eyebrow icon={Sparkles}>{tr('cards.interestsEyebrow', 'Interests')}</Eyebrow>
          <h3 className={styles.display}>{title}</h3>
          <Bubbles chips={data.chips || []} extra={data.extra} tr={tr} />
        </>
      );
      break;
    }
    case 'values': {
      Watermark = Gem;
      title = tr('vibe.valuesTitle', 'What matters most');
      body = (
        <>
          <Eyebrow icon={Gem}>{tr('cards.valuesEyebrow', 'Values')}</Eyebrow>
          <h3 className={styles.display}>{title}</h3>
          <Bubbles chips={data.chips || []} tr={tr} />
        </>
      );
      break;
    }
    case 'music': {
      Watermark = Music2;
      title = tr('vibe.musicTitle', 'Music taste');
      body = (
        <>
          <Eyebrow icon={Music2}>{title}</Eyebrow>
          {(data.chips || []).length > 0 && <Bubbles chips={data.chips || []} tr={tr} />}
          {(data.artists || []).length > 0 && (
            <div>
              <div className={styles.rowLabel} style={{ marginBottom: 6 }}><Mic2 className="inline w-3.5 h-3.5 mr-1.5" aria-hidden="true" />{tr('cards.music.artists', 'On repeat')}</div>
              <h3 className={styles.display} style={{ fontSize: 'clamp(22px, 3.8vh, 32px)' }}>{(data.artists || []).join(' · ')}</h3>
            </div>
          )}
          {data.musicShared && <p className={styles.sub}>🎵 {tr('vibe.musicMatch', 'Music match - you have taste in common')}</p>}
          {data.musicLink && (
            <div>
              <button type="button" className={styles.playBtn} onClick={(e) => { e.stopPropagation(); setPlaying(true); }}>
                ▶ {tr('cards.music.play', 'Play their song')}
              </button>
              {playing && <MusicPlayerModal link={data.musicLink} onClose={() => setPlaying(false)} />}
            </div>
          )}
        </>
      );
      break;
    }
    case 'lifestyle': {
      Watermark = Dumbbell;
      title = tr('cards.lifestyleTitle', 'Lifestyle');
      const rows = (data.traits || []).map((x) => {
        const [k, d] = TRAIT_LABELS[x.key] || [`cards.lifestyle.${x.key}`, x.key];
        return { icon: TRAIT_ICON[x.key] || Heart, label: tr(k, d), value: x.value };
      });
      body = (
        <>
          <Eyebrow icon={Activity}>{title}</Eyebrow>
          <Rows rows={rows.slice(0, 5)} />
        </>
      );
      break;
    }
    case 'trust': {
      Watermark = ShieldCheck;
      title = tr('cards.trustTitle', 'Good to know');
      const act = data.activity === 'now' ? tr('cards.trust.activeNow', 'Active now') : data.activity === 'today' ? tr('cards.trust.activeToday', 'Active today') : data.activity === 'week' ? tr('cards.trust.activeWeek', 'Active this week') : '';
      const rows: Array<{ icon: Icon; label: string; value: string }> = [];
      if (data.verified) rows.push({ icon: ShieldCheck, label: tr('cards.trust.profile', 'Profile'), value: tr('cards.trust.verified', 'Verified profile') });
      if (act) rows.push({ icon: Activity, label: tr('cards.trust.lastSeen', 'Last seen'), value: act });
      body = (
        <>
          <Eyebrow icon={Sparkles}>{title}</Eyebrow>
          <h3 className={styles.display}>{data.verified ? tr('cards.trust.headlineVerified', '{{name}} is a real, verified person', { name }) : tr('cards.trust.headlineActive', '{{name}} was around recently', { name })}</h3>
          <Rows rows={rows} />
        </>
      );
      break;
    }
    case 'starter': {
      Watermark = MessageCircle;
      title = tr('cards.starterTitle', 'Break the ice');
      const lines = openerLines(data.starters, name, tr);
      const target = data.userId && !data.isOwn ? { id: data.userId, name, photoUrl: data.photoUrl ?? null, starters: data.starters } : null;
      // One calm call to action: "Say hi" opens the Break the ice popup (openers + editable message +
      // chances left). Works before the backend exists too (the popup then offers "Copy message").
      body = (
        <>
          <Eyebrow icon={MessageCircle}>{title}</Eyebrow>
          <h3 className={cx(styles.display, styles.romance)}>{tr('cards.starter.headline', 'Be the first to say hi')}</h3>
          {target && <IcebreakerButton alwaysShow compact target={{ ...target, prefill: lines[0] }} />}
        </>
      );
      break;
    }
    case 'welcome': {
      center = true;
      Watermark = Heart;
      title = tr('cards.welcomeTitle', 'New here');
      const meta = [typeof data.age === 'number' ? String(data.age) : '', data.city || ''].filter(Boolean).join(' · ');
      body = (
        <>
          <div className={cx(styles.badge, styles.badgeEmoji, styles.badgeSm)} aria-hidden="true">👋</div>
          <h3 className={cx(styles.display, styles.welcomeTitle)}>{title}</h3>
          <p className={cx(styles.sub, styles.welcomeSub)}>{tr('cards.welcomeBody', '{{name}} is just getting started - be the first to say hi.', { name })}</p>
          {(meta || intent) && <p className={styles.welcomeMeta}>{[meta, intent].filter(Boolean).join('  ·  ')}</p>}
          {data.userId && !data.isOwn && (
            <IcebreakerButton alwaysShow compact target={{ id: data.userId, name, photoUrl: data.photoUrl ?? null, starters: data.starters }} />
          )}
        </>
      );
      break;
    }
  }

  return (
    <div
      className={styles.shell}
      role="group"
      aria-label={title}
      data-card-kind={card.kind}
      style={{ '--c-from': palette.from, '--c-to': palette.to, '--c-glow': palette.glow } as React.CSSProperties}
    >
      <div className={styles.watermark} aria-hidden="true"><Watermark /></div>
      <div className={styles.decor} aria-hidden="true">
        {DECOR.map((d, i) => {
          const I = d.spark ? Sparkles : Watermark;
          return (
            <span
              key={i}
              className={styles.decorItem}
              style={{ left: d.x, top: d.y, width: d.size, height: d.size, '--dx': d.dx, '--dy': d.dy, '--rot': d.rot, '--dur': d.dur, '--delay': d.delay, '--op': d.op } as React.CSSProperties}
            >
              <I />
            </span>
          );
        })}
      </div>
      <div ref={boxRef} className={cx(styles.body, center && styles.center)}><div ref={fitRef} className={styles.fit}>{body}</div></div>
    </div>
  );
});
InfoCardSlide.displayName = 'InfoCardSlide';

export default InfoCardSlide;
