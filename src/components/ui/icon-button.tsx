import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * IconButton - icon-only tap target. `aria-label` is REQUIRED (a screen reader
 * has nothing else to read). md = 44px (default, meets the touch minimum),
 * sm = 36px (dense toolbars / overlays on photos only).
 */
const iconButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full transition-[color,background-color,transform,filter] duration-150 ease-out active:scale-[0.94] dl-focus disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        quiet: "dl-quiet bg-transparent",
        soft: "bg-brand/15 text-brand-ink hover:bg-brand/25",
        primary: "bg-brand-gradient text-white shadow-dl-brand hover:brightness-110",
        danger: "bg-danger text-white hover:bg-danger-strong",
        /** For controls sitting on top of photos/video. */
        overlay: "bg-black/45 text-white hover:bg-black/60",
      },
      size: {
        sm: "h-9 w-9 [&_svg]:size-4",
        md: "h-11 w-11 [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "quiet", size: "md" },
  }
)

interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label">,
    VariantProps<typeof iconButtonVariants> {
  "aria-label": string
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    />
  )
)
IconButton.displayName = "IconButton"

export { IconButton, iconButtonVariants }
