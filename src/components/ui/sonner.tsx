import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-surface group-[.toaster]:text-white group-[.toaster]:border-white/10 group-[.toaster]:rounded-card group-[.toaster]:shadow-dl-lg",
          description: "group-[.toast]:text-white/70",
          actionButton:
            "group-[.toast]:bg-brand-gradient group-[.toast]:text-white group-[.toast]:rounded-full group-[.toast]:font-semibold",
          cancelButton:
            "group-[.toast]:bg-white/10 group-[.toast]:text-white group-[.toast]:rounded-full",
        },
      }}
      {...props}
    />
  )
}

export { Toaster,  }
