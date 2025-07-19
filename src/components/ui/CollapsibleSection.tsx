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
    <Card className={`w-full ${className}`}>
      <CardHeader 
        className="cursor-pointer hover:bg-gray-50 transition-colors duration-200 px-6 py-4"
        onClick={onToggle}
      >
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-semibold text-gray-900">
            {title}
          </CardTitle>
          <div className="flex items-center text-gray-500">
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
