import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AdCardProps {
  ad: {
    id: string;
    image_url: string;
    name: string;
    about: string;
    link: string | null;
    link_as: string | null;
  };
  onSwipe?: () => void;
}

const AdCard: React.FC<AdCardProps> = ({ ad, onSwipe }) => {
  const handleLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (ad.link) {
      window.open(ad.link, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* Full-page Ad Image */}
      <div className="flex-1 relative overflow-hidden">
        <img
          src={ad.image_url}
          alt={ad.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        
        {/* Ad Badge */}
        <div className="absolute top-4 left-4 bg-yellow-400 text-black px-3 py-1 rounded-full text-xs font-bold">
          Sponsored
        </div>
      </div>

      {/* Ad Info */}
      <div className="p-6 bg-white">
        <h2 className="text-2xl font-bold mb-2">{ad.name}</h2>
        <p className="text-gray-600 mb-4">{ad.about}</p>
        
        {ad.link && (
          <Button 
            onClick={handleLinkClick}
            className="w-full bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            {ad.link_as || 'Click here'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default AdCard;
