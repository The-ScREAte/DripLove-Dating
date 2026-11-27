import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Chip - selectable pill for interests, filters and quick choices.
 * Selected = brand gradient, unselected = neutral outline. Announces its state
 * with aria-pressed. 40px tall (dense, but above the 36px minimum for lists).
 */
interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  icon?: React.ReactNode
}

const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, selected = false, icon, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.96] dl-focus disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        selected
          ? "border border-transparent bg-brand-gradient text-white shadow-dl-brand"
          : "dl-line bg-transparent",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
)
Chip.displayName = "Chip"

export { Chip }
