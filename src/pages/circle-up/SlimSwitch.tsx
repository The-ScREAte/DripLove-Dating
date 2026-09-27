interface SlimSwitchProps {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

// The shared shadcn Switch (h-6 w-11) reads oversized next to a settings
// label at this density - a dedicated slim track/thumb here instead of
// overriding its size via className, since its thumb's checked-state
// translate distance is hardcoded to that specific width.
//
// min-h-0 is required: a global mobile rule (src/index.css) sets
// `button, [role="button"] { min-height: 44px }` for touch-target sizing,
// which silently wins over any smaller `height` set on the element itself
// (min-height always clamps height upward) - same reason
// .discover-filters-compact has to reset it explicitly.
const SlimSwitch = ({ checked, onCheckedChange, disabled, ...rest }: SlimSwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className={`relative inline-flex h-5 min-h-0 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 disabled:opacity-30 disabled:cursor-not-allowed ${
      checked ? 'bg-pink-500' : 'bg-white/15'
    }`}
    {...rest}
  >
    <span
      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-1'
      }`}
    />
  </button>
);

export default SlimSwitch;
