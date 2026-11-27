import React from 'react';
import { Check } from 'lucide-react';

export interface BubbleOption {
  value: string;
  label: string;
  emoji?: string;
}

interface BubbleClusterProps {
  label: string;
  options: BubbleOption[];
  selected: string[];
  max: number;
  onToggle: (value: string) => void;
}

/**
 * A soft floating cluster of big rounded bubbles. Tap to select: the bubble pops and fills with
 * the brand gradient. Each bubble drifts gently (opacity/transform only; off under reduced motion).
 * Bubbles are >= 72px so the touch target is generous, and the cluster wraps at any width (320px+).
 */
export const BubbleCluster = ({ label, options, selected, max, onToggle }: BubbleClusterProps) => {
  const full = selected.length >= max;
  return (
    <div role="group" aria-label={label} className="ob-bubbles">
      {options.map((opt, i) => {
        const on = selected.includes(opt.value);
        // Size by the LONGEST WORD so a word is never split mid-letter (labels wrap only at spaces).
        const longest = Math.max(...opt.label.split(/\s+/).map((w) => w.length));
        const size = longest > 10 ? 'lg' : longest > 6 ? 'md' : 'sm';
        return (
          // The outer slot gives every bubble a FIXED circular footprint and carries the slow
          // circular drift (transform only, so it never shifts the layout). The button inside keeps
          // its own tap/pop scale, so the two animations never fight over `transform`.
          <span
            key={opt.value}
            className="ob-bubble-orbit"
            data-size={size}
            data-dir={i % 2 === 0 ? 'cw' : 'ccw'}
            style={{
              ['--b-delay' as string]: `${(i % 9) * -1.7}s`,
              ['--b-dur' as string]: `${9 + (i % 5) * 1.6}s`,
              ['--b-r' as string]: `${3.5 + (i % 4) * 1.2}`,
            }}
          >
            <button
              type="button"
              className="ob-bubble"
              data-on={on ? 'true' : undefined}
              data-size={size}
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => onToggle(opt.value)}
            >
              <span className="ob-bubble-in">
                {opt.emoji && (
                  <span className="ob-bubble-emoji" aria-hidden="true">
                    {opt.emoji}
                  </span>
                )}
                <span className="ob-bubble-label">{opt.label}</span>
              </span>
              {on && <Check className="ob-bubble-check" aria-hidden="true" />}
            </button>
          </span>
        );
      })}
    </div>
  );
};

/** "n/min selected" pill: shows progress toward the suggested minimum, then a quiet "n selected". */
export const SelectedPill = ({ count, min, max, text }: { count: number; min: number; max: number; text: string }) => (
  <div className="ob-pill" data-ready={count >= min ? 'true' : undefined} aria-live="polite">
    <span className="ob-pill-count">
      {count}/{max}
    </span>
    <span>{text}</span>
  </div>
);
