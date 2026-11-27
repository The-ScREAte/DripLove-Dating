import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const fieldTone = cva("", {
  variants: {
    tone: {
      light: "",
      dark: "border-white/15 bg-white/5 text-white placeholder:text-white/40",
    },
  },
  defaultVariants: { tone: "light" },
})

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof fieldTone> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, tone, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[96px] w-full rounded-input border border-input bg-background px-3.5 py-3 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
          fieldTone({ tone }),
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
