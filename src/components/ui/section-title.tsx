import * as React from "react"

import { cn } from "@/lib/utils"

/** SectionTitle - heading for a block of a screen, with an optional right-side action. */
interface SectionTitleProps {
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
}

function SectionTitle({ children, action, className }: SectionTitleProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="dl-heading">{children}</h2>
      {action}
    </div>
  )
}

export { SectionTitle }
