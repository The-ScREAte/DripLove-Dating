import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Professional safe area hook for Capacitor React apps
 * Provides safe area insets for proper mobile layout
 */
export const useSafeAreaInsets = (): SafeAreaInsets => {
  const [insets, setInsets] = useState<SafeAreaInsets>({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });

  useEffect(() => {
    const getSafeAreaInsets = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          // For native platforms, get status bar info
          const info = await StatusBar.getInfo();
          
          // Set safe area insets based on platform
          if (Capacitor.getPlatform() === 'ios') {
            // iOS safe areas (includes notch/Dynamic Island)
            setInsets({
              top: info.visible ? 44 : 20, // Status bar height + safe area
              bottom: 34, // Home indicator area
              left: 0,
              right: 0,
            });
          } else if (Capacitor.getPlatform() === 'android') {
            // Android safe areas (status bar, navigation bar)
            setInsets({
              top: info.visible ? 24 : 0, // Status bar height
              bottom: 0, // Android navigation handled by system
              left: 0,
              right: 0,
            });
          }
        } catch (error) {
          // Fallback to default values
          setInsets({
            top: 20,
            bottom: 0,
            left: 0,
            right: 0,
          });
        }
      } else {
        // Web platform - no safe area needed
        setInsets({
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        });
      }
    };

    getSafeAreaInsets();
  }, []);

  return insets;
};

/**
 * Safe area styles generator for consistent mobile layouts
 */
export const createSafeAreaStyles = (insets: SafeAreaInsets) => ({
  paddingTop: insets.top,
  paddingBottom: insets.bottom,
  paddingLeft: insets.left,
  paddingRight: insets.right,
});

/**
 * Safe area container component props
 */
export interface SafeAreaViewProps {
  children: React.ReactNode;
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Professional SafeAreaView component for Capacitor React apps
 * Usage: <SafeAreaView edges={['top']}><Header /></SafeAreaView>
 */
export const SafeAreaView: React.FC<SafeAreaViewProps> = ({
  children,
  edges = ['top', 'bottom'],
  style = {},
  className = '',
}) => {
  const insets = useSafeAreaInsets();

  const safeAreaStyle: React.CSSProperties = {
    ...style,
    ...(edges.includes('top') && { paddingTop: insets.top }),
    ...(edges.includes('bottom') && { paddingBottom: insets.bottom }),
    ...(edges.includes('left') && { paddingLeft: insets.left }),
    ...(edges.includes('right') && { paddingRight: insets.right }),
  };

  return (
    <div style={safeAreaStyle} className={className}>
      {children}
    </div>
  );
};
