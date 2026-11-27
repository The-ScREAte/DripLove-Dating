import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Button - the ONE way to make a tappable action. Rules live in ./README.md.
 *
 * User-facing variants (pick by what the control DOES):
 *   primary  - the single main action on a screen (brand gradient)
 *   soft     - supportive action next to a primary (brand tint)
 *   line     - neutral outlined action (follows surrounding text colour)
 *   quiet    - low-emphasis / toolbar action, no border
 *   danger   - destructive or irreversible action
 *   link     - inline text action
 * Legacy shadcn variants (default / destructive / outline / secondary / ghost)
 * are kept ONLY so the admin area keeps looking the same - don't use them in
 * user-facing screens.
 *
 * Role-specific variants (only for the one role each names):
 *   premium    - gold "upgrade to Premium" call to action
 *   success    - positive confirmation / "Green flag" style answer
 *   dangerSoft - destructive but secondary (e.g. "Delete account" in a list)
 *   overlay    - control floating on top of a photo/video
 *   social / socialDark - platform sign-in buttons (Google / Apple)
 *
 * Sizes: sm (36px, dense secondary controls), md (44px, default for user
 * screens), lg (48px, full-width screen CTAs), iconMd (44px) / iconSm (36px)
 * for icon-only buttons that need a Button variant (new code: <IconButton/>).
 * `icon` is the legacy 40px size (admin).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-[color,background-color,border-color,box-shadow,transform,filter] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // ---- user-facing, brand-aware ----
        primary:
          "bg-brand-gradient text-white font-semibold shadow-dl-brand hover:brightness-110 active:brightness-95 disabled:shadow-none focus-visible:ring-brand focus-visible:ring-offset-0",
        soft:
          "bg-brand/15 text-brand-ink font-semibold hover:bg-brand/25 focus-visible:ring-brand focus-visible:ring-offset-0",
        line:
          "dl-line bg-transparent font-medium focus-visible:ring-brand focus-visible:ring-offset-0",
        quiet:
          "dl-quiet bg-transparent font-medium focus-visible:ring-brand focus-visible:ring-offset-0",
        danger:
          "bg-danger text-white font-semibold hover:bg-danger-strong focus-visible:ring-danger focus-visible:ring-offset-0",
        premium:
          "bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold shadow-sm hover:brightness-105 focus-visible:ring-yellow-500 focus-visible:ring-offset-0",
        success:
          "bg-success text-white font-semibold hover:brightness-110 focus-visible:ring-success focus-visible:ring-offset-0",
        dangerSoft:
          "bg-danger/15 text-danger font-semibold hover:bg-danger/25 focus-visible:ring-danger focus-visible:ring-offset-0",
        overlay:
          "bg-black/55 text-white border border-white/15 hover:bg-black/70 focus-visible:ring-white focus-visible:ring-offset-0",
        social:
          "bg-white text-neutral-800 border border-neutral-300 font-medium hover:bg-neutral-50 focus-visible:ring-neutral-400 focus-visible:ring-offset-0",
        socialDark:
          "bg-black text-white border border-white/20 font-medium hover:bg-neutral-900 focus-visible:ring-white focus-visible:ring-offset-0",
        link: "text-brand-ink underline-offset-4 hover:underline rounded-md",
        // ---- legacy (admin) ----
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-full px-3.5",
        md: "h-11 min-w-touch px-5",
        lg: "h-12 rounded-full px-8 text-base [&_svg]:size-5",
        icon: "h-10 w-10",
        iconMd: "h-11 w-11 p-0",
        iconSm: "h-9 w-9 p-0",
      },
    },
    compoundVariants: [
      // `link` is text: no box, no min sizes
      { variant: "link", className: "h-auto p-0 active:scale-100" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button"
    // `asChild` renders the child element as-is, so it can't also host a spinner.
    const showSpinner = loading && !asChild
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || showSpinner}
        aria-busy={showSpinner || undefined}
        {...props}
      >
        {showSpinner ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
export type { ButtonProps }
