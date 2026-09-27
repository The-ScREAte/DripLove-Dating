import { ChevronLeft } from 'lucide-react';

interface CircleUpHeaderProps {
  onBack: () => void;
  title?: string;
  backLabel?: string;
}

// Always visible - a normal (non-scrolling) flex item at the top of each
// screen's h-[100dvh] flex column, with the body as the only scrollable
// section below it. Kept as one shared component so every Circle Up screen
// shows the exact same bar rather than each re-implementing its own.
const CircleUpHeader = ({ onBack, title = 'Circle Up', backLabel = 'Back' }: CircleUpHeaderProps) => (
  <div className="flex items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 bg-black flex-shrink-0">
    <button type="button" onClick={onBack} className="p-2 -ml-2 text-white/70 hover:text-white" aria-label={backLabel}>
      <ChevronLeft className="w-6 h-6" />
    </button>
    <h1 className="text-white font-semibold text-base">{title}</h1>
  </div>
);

export default CircleUpHeader;
