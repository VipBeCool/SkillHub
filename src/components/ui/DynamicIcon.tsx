import React from 'react';
import * as LucideIcons from 'lucide-react';
import { IconConfig } from '../../lib/iconTypes';

interface DynamicIconProps {
  config: IconConfig | null;
  className?: string;
  defaultIcon?: string; // Fallback Lucide icon name, e.g., 'Layers'
  size?: number | string;
}

export const DynamicIcon: React.FC<DynamicIconProps> = ({ config, className = '', defaultIcon = 'Layers', size = 20 }) => {
  if (config?.type === 'emoji') {
    return (
      <span
        className={`inline-flex items-center justify-center select-none ${className}`}
        style={{ fontSize: typeof size === 'number' ? `${size}px` : size, lineHeight: 1 }}
      >
        {config.value}
      </span>
    );
  }

  // Handle icon or fallback
  const iconName = config?.type === 'icon' ? config.value : defaultIcon;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (LucideIcons as any)[iconName];

  if (!IconComponent) {
    // If the icon doesn't exist, fallback to the default
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Fallback = (LucideIcons as any)[defaultIcon] || LucideIcons.HelpCircle;
    return <Fallback className={className} size={size} color={config?.color || 'currentColor'} />;
  }

  return <IconComponent className={className} size={size} color={config?.color || 'currentColor'} />;
};
