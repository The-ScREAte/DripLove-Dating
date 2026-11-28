import React from 'react';
import { ChevronDown, ChevronUp, Pencil, Save, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface CollapsibleSectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** Shows Edit / Save+Cancel controls in the header (top-right, next to the
      chevron) while the section is open - lets the user edit and save right
      from here instead of scrolling back up to the page's main Edit button. */
  showEditButton?: boolean;
  isEditing?: boolean;
  isSaving?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
}

const iconButtonStyle = { width: 26, height: 26, minWidth: 26, minHeight: 26, padding: 0 } as const;

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  isOpen,
  onToggle,
  children,
  className = "",
  id,
  showEditButton = false,
  isEditing = false,
  isSaving = false,
  onEdit,
  onSave,
  onCancel,
}) => {
  return (
    <Card id={id} className={`w-full bg-white/[0.03] border-white/[0.06] shadow-none ${className}`}>
      <CardHeader
        className="cursor-pointer hover:bg-white/[0.04] transition-colors duration-200 px-5 py-2.5"
        onClick={onToggle}
      >
        <div className="flex justify-between items-center">
          <CardTitle className="text-[15px] font-semibold text-white/90">
            {title}
          </CardTitle>
          <div className="flex items-center gap-2 text-white/80">
            {isOpen && showEditButton && (
              isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSave?.(); }}
                    disabled={isSaving}
                    aria-label="Save"
                    style={iconButtonStyle}
                    className="flex items-center justify-center shrink-0 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors"
                  >
                    <Save size={13} style={{ width: 13, height: 13 }} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCancel?.(); }}
                    disabled={isSaving}
                    aria-label="Cancel"
                    style={iconButtonStyle}
                    className="flex items-center justify-center shrink-0 rounded-full bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors"
                  >
                    <X size={13} style={{ width: 13, height: 13 }} />
                  </button>
                </>
              ) : (
                onEdit && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    aria-label="Edit"
                    style={iconButtonStyle}
                    className="flex items-center justify-center shrink-0 rounded-full bg-white/[0.06] text-white/80 hover:bg-white/10 transition-colors"
                  >
                    <Pencil size={13} style={{ width: 13, height: 13 }} />
                  </button>
                )
              )
            )}
            {isOpen ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </div>
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="px-5 pb-5 pt-0">
          {children}
        </CardContent>
      )}
    </Card>
  );
};

export default CollapsibleSection;
