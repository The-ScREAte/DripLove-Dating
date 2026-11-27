import React from 'react';
import { cn } from '@/lib/utils';

/** One titled block of the expanded profile panel. Same look on every screen. */
export const ProfileSection: React.FC<{
  title: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, icon, className, children }) => (
  <section className={cn('rounded-2xl border border-brand/20 bg-white/[0.03] p-4', className)}>
    <h4 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase leading-none tracking-wider text-brand-ink [&_svg]:size-4 [&_svg]:shrink-0">
      {icon}
      <span className="min-w-0 break-words">{title}</span>
    </h4>
    {children}
  </section>
);

/** Icon + text row. Text wraps instead of clipping, so long values stay readable. */
export const FactRow: React.FC<{ icon?: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="flex items-start gap-3 text-[15px] leading-snug text-white/90">
    {icon && (
      <span className="mt-[2px] shrink-0 text-brand-ink [&_svg]:size-4" aria-hidden="true">
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
  <div className="flex items-baseline gap-2 text-[15px] leading-snug">
    <span className="shrink-0" aria-hidden="true">{emoji}</span>
    <span className="shrink-0 text-white/60">{label}</span>
    <span dir="auto" className="ml-auto min-w-0 break-words text-right font-medium text-white">{value}</span>
  </div>
);

/** Read-only wrapped chips (interests, pets, languages ...). Never truncates. */
export const TraitChips: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="flex flex-wrap gap-2">
    {items.map((item, index) => (
      <li
        key={index}
        dir="auto"
        className="inline-flex min-h-8 max-w-full items-center break-words rounded-full border border-brand/30 bg-brand/15 px-3 py-1 text-sm leading-snug text-white/95"
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
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm leading-none">
        <span className={cn('min-w-0 break-words', pct < 50 ? 'font-semibold text-white' : 'text-white/55')}>{leftLabel}</span>
        <span className={cn('min-w-0 break-words text-right', pct > 50 ? 'font-semibold text-white' : 'text-white/55')}>{rightLabel}</span>
      </div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${leftLabel} / ${rightLabel}`}
        className="h-2 w-full overflow-hidden rounded-full bg-white/10"
      >
        <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};
