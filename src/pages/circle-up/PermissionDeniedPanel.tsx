import React from 'react';
import SharedPermissionDeniedPanel from '@/components/PermissionDeniedPanel';

/** Circle Up needs camera + microphone. Kept as a thin wrapper so existing imports keep working. */
const PermissionDeniedPanel: React.FC<{ onRetry: () => void; className?: string }> = ({ onRetry, className }) => (
  <SharedPermissionDeniedPanel kind="cameraMicrophone" onRetry={onRetry} className={className} />
);

export default PermissionDeniedPanel;
