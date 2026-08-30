import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface CollapsibleSectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  isOpen,
  onToggle,
  children,
  className = ""
}) => {
  return (
    <Card className={`w-full bg-black border-pink-500/30 ${className}`}>
      <CardHeader
        className="cursor-pointer hover:bg-pink-500/10 transition-colors duration-200 px-6 py-2.5"
        onClick={onToggle}
      >
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-semibold text-white">
            {title}
          </CardTitle>
          <div className="flex items-center text-gray-300">
            {isOpen ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </div>
        </div>
      </CardHeader>
      
      {isOpen && (
        <CardContent className="px-6 pb-6 pt-0">
          {children}
        </CardContent>
      )}
    </Card>
  );
};

export default CollapsibleSection;
