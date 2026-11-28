import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared surface of the expanded profile panel: a barely-lifted glass card with a soft pink hairline
 * (no blur, so it looks the same on iOS and Android). Also used by CaptionPhotoCard.
 */
export const SOFT_SURFACE =
  'rounded-[20px] border border-[rgba(244,114,182,0.2)] bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(244,114,182,0.04))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]';

/** One titled block of the expanded profile panel. Same look on every screen. */
export const ProfileSection: React.FC<{
  title: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, icon, className, children }) => (
  <section className={cn(SOFT_SURFACE, 'px-4 pb-4 pt-3.5', className)}>
    <h4 className="mb-3 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase leading-none tracking-[0.12em] text-[rgba(249,168,212,0.82)] [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:opacity-90">
      {icon}
      <span className="min-w-0 break-words">{title}</span>
    </h4>
    {children}
  </section>
);

/** Rows separated by faint hairlines (At a glance, Lifestyle). */
export const RowList: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="-my-1.5 divide-y divide-white/[0.07] [&>*]:py-2">{children}</div>
);

/** Icon + text row. Text wraps instead of clipping, so long values stay readable. */
export const FactRow: React.FC<{ icon?: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="flex items-center gap-3 text-[15px] leading-snug text-white/[0.88]">
    {icon && (
      <span
        className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-[rgba(244,114,182,0.12)] text-[#f9a8d4] [&_svg]:size-[14px]"
        aria-hidden="true"
      >
        {icon}
      </span>
    )}
    <span dir="auto" className="min-w-0 flex-1 break-words">
      {children}
    </span>
  </div>
);

/** "Label ........ Value" row used by Lifestyle. */
export const LabelValueRow: React.FC<{ emoji: string; label: string; value: string }> = ({ emoji, label, value }) => (
  <div className="flex items-center gap-3 text-[15px] leading-snug">
    <span className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-[rgba(244,114,182,0.12)] text-[13px]" aria-hidden="true">
      {emoji}
    </span>
    <span className="shrink-0 text-white/55">{label}</span>
    <span dir="auto" className="ml-auto min-w-0 break-words text-right text-white/[0.88]">{value}</span>
  </div>
);

/** Read-only wrapped chips (interests, pets, languages ...). Never truncates. */
export const TraitChips: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="flex flex-wrap gap-2">
    {items.map((item, index) => (
      <li
        key={index}
        dir="auto"
        className="inline-flex min-h-8 max-w-full items-center break-words rounded-full border border-[rgba(244,114,182,0.24)] bg-[rgba(244,114,182,0.09)] px-3 py-1 text-[13.5px] leading-snug text-white/[0.88]"
      >
        {item}
      </li>
    ))}
  </ul>
);

/** A 0-100 slider between two traits. The leaning side is emphasised. */
export const PersonalityBar: React.FC<{
  value: number;
  leftLabel: string;
  rightLabel: string;
}> = ({ value, leftLabel, rightLabel }) => {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-[13.5px] leading-none">
        <span className={cn('min-w-0 break-words', pct < 50 ? 'font-medium text-white/90' : 'text-white/50')}>{leftLabel}</span>
        <span className={cn('min-w-0 break-words text-right', pct > 50 ? 'font-medium text-white/90' : 'text-white/50')}>{rightLabel}</span>
      </div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${leftLabel} / ${rightLabel}`}
        className="relative h-1.5 w-full rounded-full bg-white/[0.08]"
      >
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,rgba(244,114,182,0.85),rgba(192,132,252,0.85))]"
          style={{ width: `${pct}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fbcfe8] shadow-[0_0_0_3px_rgba(244,114,182,0.22)] rtl:translate-x-1/2"
          style={{ insetInlineStart: `${Math.max(3, Math.min(97, pct))}%` }}
        />
      </div>
    </div>
  );
};
