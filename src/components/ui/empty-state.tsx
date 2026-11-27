import * as React from "react"

import { cn } from "@/lib/utils"

/** EmptyState - icon + title + one-line direction + optional action. */
interface EmptyStateProps {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-white", className)}>
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-brand-ink [&_svg]:size-7">
          {icon}
        </div>
      )}
      <h2 className="dl-heading">{title}</h2>
      {description && <p className="dl-body max-w-xs text-white/70">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export { EmptyState }
