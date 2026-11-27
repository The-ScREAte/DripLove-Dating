import React from 'react';
import { ArrowLeft, Check, Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ui/icon-button';
import { Chip } from '@/components/ui/chip';
import { formInput } from '@/components/forms/formTheme';
import { handleInputBlur, handleInputFocus, getInputStyles } from '@/utils/inputUtils';
import { passwordStrength } from './steps';
import { HeartDefs, HeartsBurst } from './Illustrations';

/* ---------------------------------------------------------------- *
 * Progress header: back arrow, "Step x of y", optional side action,
 * and a filled track with a node per step (done = check, current = ring).
 * ---------------------------------------------------------------- */
interface ProgressHeaderProps {
  /** how far along, 0..1 (required screens only - optional ones never inflate it) */
  fraction: number;
  phase: 'main' | 'celebrate' | 'bonus';
  /** bumps each time a phase is completed -> a small hearts burst from the heart */
  burstKey: number;
  /** short, warm line shown briefly as you move forward (null = nothing) */
  cheer?: { key: number; text: string } | null;
  /** bumps with each cheer -> the riding heart pulses once */
  pulseKey?: number;
  onBack?: () => void;
  backLabel: string;
  /** right-hand action (e.g. Cancel / Sign in) */
  action?: React.ReactNode;
  disabled?: boolean;
}

/**
 * One slim "love line": a gradient fill that glides between screens with a
 * single beating heart riding its leading edge (it hops forward with a soft
 * spring). No step counter - the flow should feel short, not like "step 3 of 13".
 */
export const ProgressHeader = ({ fraction, phase, burstKey, cheer = null, pulseKey = 0, onBack, backLabel, action, disabled }: ProgressHeaderProps) => {
  const { t } = useTranslation();
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <header className="ob-header">
      <HeartDefs />
      <div className="ob-topbar">
        <div className="ob-topbar-side">
          {onBack && (
            <IconButton onClick={onBack} disabled={disabled} aria-label={backLabel}>
              <ArrowLeft aria-hidden="true" />
            </IconButton>
          )}
        </div>
        <p className="ob-step-label" aria-live="polite">
          {phase === 'bonus' ? t('onboarding.bonus') : ''}
        </p>
        <div className="ob-topbar-side">{action}</div>
      </div>
      <div
        className="ob-line-wrap"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(f * 100)}
        aria-label={t('onboarding.progress')}
      >
        <div className="ob-line" data-phase={phase}>
          <div className="ob-line-fill" style={{ transform: `scaleX(${f})` }} />
          <div className="ob-line-rider" style={{ transform: `translateX(${f * 100}%)` }}>
            <span className="ob-rider-heart">
              <Heart key={pulseKey} className={pulseKey > 0 ? 'ob-heart-once' : undefined} fill="url(#ob-heart-grad)" strokeWidth={0} aria-hidden="true" />
              {burstKey > 0 && <HeartsBurst key={burstKey} size="sm" />}
            </span>
          </div>
        </div>
      </div>
      {/* polite live region: announced to screen readers, floats over the top of the
          screen for ~1.8s and never takes pointer events */}
      <div className="ob-cheer-wrap" role="status" aria-live="polite">
        {cheer && (
          <span key={cheer.key} className="ob-cheer">
            <Heart fill="currentColor" strokeWidth={0} aria-hidden="true" />
            {cheer.text}
          </span>
        )}
      </div>
    </header>
  );
};

/* ---------------------------------------------------------------- *
 * Field: label + input (+ icon, trailing adornment, error, help).
 * ---------------------------------------------------------------- */
interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  error?: string;
  help?: string;
  required?: boolean;
  optional?: boolean;
  trailing?: React.ReactNode;
  className?: string;
  children?: React.ReactNode; // rendered under the input (e.g. password meter)
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ id, label, icon, error, help, required, optional, trailing, className, children, style, ...input }, ref) => {
    const { t } = useTranslation();
    const describedBy = error ? `${id}-err` : help ? `${id}-help` : undefined;
    return (
      <div className={className}>
        <label htmlFor={id} className="ob-label">
          {label}
          {required && <span className="ob-required"> *</span>}
          {optional && <span className="ob-optional">{t('onboarding.optional')}</span>}
        </label>
        <div className="relative mt-1.5">
          {icon && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-white/45 [&_svg]:h-4 [&_svg]:w-4"
            >
              {icon}
            </span>
          )}
          <Input
            ref={ref}
            id={id}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            className={`mobile-input-field ${formInput(!!error)} ${icon ? 'pl-10' : ''} ${trailing ? 'pr-12' : ''} h-[52px]`}
            style={{ ...getInputStyles(), ...style }}
            {...input}
          />
          {trailing && <div className="absolute right-1 top-1/2 -translate-y-1/2">{trailing}</div>}
        </div>
        {error ? (
          <p id={`${id}-err`} role="alert" className="ob-error">
            {error}
          </p>
        ) : help ? (
          <p id={`${id}-help`} className="ob-help">
            {help}
          </p>
        ) : null}
        {children}
      </div>
    );
  },
);
Field.displayName = 'Field';

/* ---------------------------------------------------------------- *
 * ChoiceGroup: big radio cards (gender, looking for, intent).
 * ---------------------------------------------------------------- */
export interface Choice {
  value: string;
  label: string;
  sub?: string;
}

interface ChoiceGroupProps {
  label: string;
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  optional?: boolean;
  name: string;
  /** 'row' = compact equal-width columns for short labels (Male / Female / Other) */
  layout?: 'stack' | 'row';
}

export const ChoiceGroup = ({ label, value, options, onChange, error, required, optional, name, layout = 'stack' }: ChoiceGroupProps) => {
  const { t } = useTranslation();
  const labelId = `${name}-label`;
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.value);
    (e.currentTarget.parentElement?.querySelectorAll('[role=radio]')[(i + dir + options.length) % options.length] as HTMLElement | undefined)?.focus();
  };
  return (
    <div>
      <p id={labelId} className="ob-label">
        {label}
        {required && <span className="ob-required"> *</span>}
        {optional && <span className="ob-optional">{t('onboarding.optional')}</span>}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} aria-invalid={!!error} className="ob-choice-grid mt-2" data-layout={layout}>
        {options.map((opt, i) => {
          const checked = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || (!value && i === 0) ? 0 : -1}
              className="ob-choice"
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className="ob-choice-dot" aria-hidden="true">
                <Check className="h-3 w-3" strokeWidth={3.5} />
              </span>
              <span>
                {opt.label}
                {opt.sub && <span className="ob-choice-sub">{opt.sub}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="ob-error">
          {error}
        </p>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------- *
 * ChipGroup: pill options for short lists (education level).
 * ---------------------------------------------------------------- */
export const ChipGroup = ({ label, value, options, onChange, error, required, optional, name }: ChoiceGroupProps) => {
  const { t } = useTranslation();
  const labelId = `${name}-label`;
  return (
    <div>
      <p id={labelId} className="ob-label">
        {label}
        {required && <span className="ob-required"> *</span>}
        {optional && <span className="ob-optional">{t('onboarding.optional')}</span>}
      </p>
      <div role="group" aria-labelledby={labelId} className="ob-chips mt-2">
        {options.map((opt) => (
          <Chip key={opt.value} selected={value === opt.value} onClick={() => onChange(opt.value)}>
            {opt.label}
          </Chip>
        ))}
      </div>
      {error && (
        <p role="alert" className="ob-error">
          {error}
        </p>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------- *
 * MultiChips: pick several (optionally up to `max`); selected chips
 * carry a small heart accent.
 * ---------------------------------------------------------------- */
interface MultiChipsProps {
  label?: string;
  options: Choice[];
  selected: string[];
  onToggle: (value: string) => void;
  max?: number;
  heart?: boolean;
}

export const MultiChips = ({ label, options, selected, onToggle, max, heart = true }: MultiChipsProps) => {
  const full = max !== undefined && selected.length >= max;
  return (
    <div>
      {label && <p className="ob-label">{label}</p>}
      <div role="group" aria-label={label} className="ob-chips mt-2">
        {options.map((opt) => {
          const on = selected.includes(opt.value);
          return (
            <Chip
              key={opt.value}
              selected={on}
              disabled={!on && full}
              icon={on && heart ? <Heart fill="currentColor" strokeWidth={0} aria-hidden="true" /> : undefined}
              onClick={() => onToggle(opt.value)}
            >
              {opt.label}
            </Chip>
          );
        })}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- */
export const PasswordMeter = ({ password }: { password: string }) => {
  const { t } = useTranslation();
  const { score } = passwordStrength(password);
  if (!password) return null;
  const labels = ['', t('onboarding.pw.tooShort'), t('onboarding.pw.okay'), t('onboarding.pw.good'), t('onboarding.pw.strong')];
  return (
    <div aria-live="polite">
      <div className="ob-meter" data-score={score} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <p className="ob-help">{labels[score]}</p>
    </div>
  );
};
