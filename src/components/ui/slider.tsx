import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => {
  // Determine how many thumbs to render. Radix supports multiple thumbs for range sliders
  const { value, defaultValue } = props as any;
  let thumbsCount = 1;
  if (Array.isArray(value)) thumbsCount = value.length;
  else if (Array.isArray(defaultValue)) thumbsCount = defaultValue.length;

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full select-none items-center",
        className
      )}
      // Prevent native touch gestures (scroll) from stealing the touch so
      // the slider can handle horizontal drags on mobile devices.
      style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', transform: 'translateZ(0)' as any }}
      {...props}
    >
      <SliderPrimitive.Track
        className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary"
        style={{ touchAction: 'none', transform: 'translateZ(0)' as any, WebkitUserSelect: 'none', userSelect: 'none' }}
      >
        <SliderPrimitive.Range className="absolute h-full bg-primary" style={{ pointerEvents: 'none', transition: 'none' }} />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbsCount }).map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          // Thumb must accept pointer events and avoid transitions that can
          // introduce jitter. We add compositing hints (translateZ) and
          // will-change so the browser promotes it to its own layer.
          // Make the visible thumb smaller but keep large touch area
          // and include an invisible larger hit area for forgiving touches.
          className="relative block h-5 w-2 rounded-full border border-primary bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 transition-none"
          style={{ touchAction: 'none', willChange: 'transform', transform: 'translateZ(0)', WebkitUserSelect: 'none' as any, userSelect: 'none', pointerEvents: 'auto' }}
        >
          {/* Invisible hit area to make the thumb easier to grab on touch devices */}
          <span className="absolute -inset-2" />
        </SliderPrimitive.Thumb>
      ))}
    </SliderPrimitive.Root>
  );
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
