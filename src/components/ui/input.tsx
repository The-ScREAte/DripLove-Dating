import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/** `tone="dark"` is for fields on the app's dark screens; default is the light field (dialogs, admin). */
const fieldTone = cva("", {
  variants: {
    tone: {
      light: "",
      dark: "border-white/15 bg-white/5 text-white placeholder:text-white/40",
    },
  },
  defaultVariants: { tone: "light" },
})

interface InputProps
  extends Omit<React.ComponentProps<"input">, "ref">,
    VariantProps<typeof fieldTone> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, tone, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-input border border-input bg-background px-3.5 py-2 text-left text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-left placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          fieldTone({ tone }),
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
