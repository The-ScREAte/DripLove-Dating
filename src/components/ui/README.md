# DripLove design system (user-facing UI)

One place defines how controls look. **Use these components; don't hand-roll
`bg-pink-600 rounded-full ...` on a `<button>`.** Tokens live in
`src/design-tokens.css`, Tailwind hooks in `tailwind.config.ts`.

The shadcn legacy variants (`default`, `destructive`, `outline`, `secondary`,
`ghost`) and light-only defaults still exist **only so the admin area keeps its
look**. Don't use them on user screens.

## Buttons - pick by what the control DOES

| Variant | Use for | Rule |
|---|---|---|
| `primary` | The one main action of a screen/dialog (Continue, Save, Send, Accept) | **One per screen.** Brand gradient. |
| `soft` | Supportive action next to a primary (e.g. "Continue with subscription") | Brand tint. |
| `line` | Neutral / secondary action (Cancel, Back, Maybe later) | Outline; follows the surrounding text colour, so it works on black screens and white dialogs. On dark surfaces pass `text-white` if the parent doesn't set a text colour. |
| `quiet` | Toolbar / low-emphasis action, icon buttons in headers | No border. |
| `danger` | Destructive or irreversible (Delete, Block, Report, Discard) | Solid red. |
| `dangerSoft` | Destructive but secondary (e.g. "Delete account" inside a list) | Red tint. |
| `link` | Inline text action | |
| `premium` | "Upgrade to Premium" only | Gold. Don't use for anything else. |
| `success` | Positive confirmation / "correct" feedback | |
| `overlay` | Controls floating on top of a photo/video | |
| `social` / `socialDark` | Google / Apple sign-in (platform branding) | |

Sizes: `sm` (36px, dense secondary controls), **`md` (44px, default for user
screens)**, `lg` (48px, full-width screen CTAs), `iconMd` (44px) / `iconSm`
(36px) for icon-only buttons. Everything interactive is at least 44px except
`sm`/`iconSm`, which are for dense non-primary controls and photo overlays.

```tsx
<Button variant="primary" size="lg" className="w-full" loading={saving}>Save</Button>
<Button variant="line" size="md">Cancel</Button>
<IconButton aria-label="Back" onClick={back}><ArrowLeft /></IconButton>
```

`loading` shows a spinner and disables the button. Don't add your own spinner,
colours, radius, height or `hover:` classes - layout classes only (`w-full`,
`flex-1`, margins).

## Other primitives

- **IconButton** - icon-only, `aria-label` required (type-enforced).
- **Chip** - selectable pill (interests, filters, presets); `selected` + `aria-pressed`.
- **PageHeader** - back button + title for pushed screens; handles safe area.
- **EmptyState**.
- **Input / Textarea / SelectTrigger** - 44px, 16px text (no iOS zoom), brand
  focus ring. Use `tone="dark"` on the app's dark screens.
- **Card** - `variant="surface"` on dark screens (default = light card, admin).
- **Badge** - `brand | success | warning | danger | neutral` for user screens.
- **AlertDialogAction** - `variant="danger"` for destructive confirmations.
- Dialog / AlertDialog / Sheet / toast share the card/sheet radius and shadows.
  A dialog that paints itself dark (`bg-black`) automatically keeps dark tokens.

## Tokens

- Brand gradient `pink-500 -> purple-600` (`bg-brand-gradient`), solid `bg-brand`,
  text `text-brand-ink`. Status: `danger`, `success`, `warning`.
- Radius: controls `rounded-control` (pill), fields `rounded-input` (14px),
  containers `rounded-card` (20px), bottom sheets `rounded-sheet` (28px).
- Elevation: `shadow-dl-sm | md | lg | brand`.
- Type: `dl-title`, `dl-heading`, `dl-body`, `dl-caption`.
- Touch: `min-h-touch` / `min-w-touch` = 44px. Focus: `dl-focus`. Press: `dl-press`.
- Motion tokens/keyframes live in `src/motion.css` (reduced/lite tiers respected).

## Do / don't

- Do pick the variant by the action's role, not by copying a colour you saw.
- Do keep one `primary` per screen; everything else `soft`/`line`/`quiet`.
- Don't put `bg-pink-*`, `from-pink-* to-purple-*`, `rounded-*`, `h-*`, `py-*`
  on a Button/Input/Card - the variant owns them.
- Raw `<button>` is fine only for non-button surfaces (a whole-card tap target,
  swipe surface, tab-bar item, menu row). Give those `dl-focus` and, if they
  respond to taps, `dl-press`. The three crash-path screens
  (`ErrorBoundary`, `ChunkLoadBoundary`, `App.tsx` refresh) use raw buttons on
  purpose so they don't depend on the UI chunk that may have failed to load -
  they use the same token classes.
