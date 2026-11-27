import * as React from "react"
import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { IconButton } from "./icon-button"

/**
 * PageHeader - the one header for pushed screens (legal pages, games, settings).
 * Back button on the left, title in the middle, optional action on the right.
 * Respects the top safe area. Sits on the dark app background.
 */
interface PageHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  onBack?: () => void
  backLabel?: string
  right?: React.ReactNode
  className?: string
}

function PageHeader({ title, subtitle, onBack, backLabel = "Back", right, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center gap-2 border-b border-white/10 bg-black px-2 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] text-white",
        className
      )}
    >
      {onBack && (
        <IconButton aria-label={backLabel} onClick={onBack}>
          <ArrowLeft />
        </IconButton>
      )}
      <div className={cn("min-w-0 flex-1", !onBack && "pl-3")}>
        <h1 className="dl-heading truncate">{title}</h1>
        {subtitle && <p className="dl-caption truncate">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
    </header>
  )
}

export { PageHeader }
