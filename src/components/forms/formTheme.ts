// Shared look for the Sign Up and Complete Profile forms, so both read as one
// product: a single solid dark page background (matching the rest of the app
// and its light status-bar icons), fields as subtle raised surfaces on it,
// white text, and the brand magenta reserved for focus states and the main
// action. Every text/background pair here clears WCAG AA contrast.

/** The one page background both forms sit on. */
export const FORM_PAGE_BG = '#0B0B0F';

export const formSectionTitle = 'text-[15px] font-semibold tracking-tight text-white';
export const formSectionHint = 'text-xs leading-relaxed text-white/55';
export const formLabel = 'block text-[13px] font-medium text-white/85';
export const formRequired = 'text-pink-400';
export const formError = 'mt-1.5 text-xs font-medium text-red-400';

// 16px text is required: iOS Safari / Android WebView zoom the page when a
// focused field's font is smaller than that.
const fieldBase =
  'h-12 w-full rounded-xl border bg-white/[0.06] px-3.5 text-[16px] text-white ' +
  'transition-colors focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-pink-500/30 ' +
  'focus:ring-offset-0 focus-visible:ring-2 focus-visible:ring-pink-500/30 focus-visible:ring-offset-0 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export const formInput = (hasError?: boolean) =>
  `${fieldBase} placeholder:text-white/40 ${
    hasError ? 'border-red-400/80 focus:border-red-400' : 'border-white/15 focus:border-pink-500'
  }`;

export const formSelectTrigger = (hasError?: boolean) =>
  `${fieldBase} data-[placeholder]:text-white/40 [&>svg]:opacity-70 ${
    hasError ? 'border-red-400/80 focus:border-red-400' : 'border-white/15 focus:border-pink-500'
  }`;

export const formSelectContent =
  'rounded-xl border border-white/10 bg-[#17171D] text-white shadow-xl ' +
  '[&_[role=option]]:py-2.5 [&_[role=option]]:text-[15px] [&_[role=option]:focus]:bg-white/10 [&_[role=option]:focus]:text-white';

// z-10 keeps the icon above the field's own background, which turns opaque
// when the browser autofills it.
export const formFieldIcon = 'pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-white/45';

export const formPrimaryButton =
  'h-12 rounded-full bg-gradient-to-r from-[#9d0d52] to-[#e0187a] text-[15px] font-semibold text-white ' +
  'shadow-[0_8px_24px_-10px_rgba(224,24,122,0.7)] transition-opacity hover:opacity-95 ' +
  'disabled:opacity-45 disabled:shadow-none disabled:cursor-not-allowed';

export const formSecondaryButton =
  'h-12 rounded-full border border-white/20 bg-transparent text-[15px] font-medium text-white ' +
  'hover:bg-white/[0.06] hover:text-white';

/** A grouped block of related fields (e.g. "About you", "Photos"). */
export const formSection = 'space-y-4 border-t border-white/[0.08] pt-6 first:border-t-0 first:pt-0';
