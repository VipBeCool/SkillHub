export interface IconConfig {
  type: 'emoji' | 'icon';
  value: string; // for emoji it's the character (e.g., '😀'), for icon it's the Lucide id (e.g., 'Home')
  color?: string; // only applicable if type === 'icon'
}

export function parseIconConfig(iconStr: string | null | undefined): IconConfig | null {
  if (!iconStr) return null;
  try {
    const config = JSON.parse(iconStr);
    if (config && (config.type === 'emoji' || config.type === 'icon') && config.value) {
      return config as IconConfig;
    }
  } catch (e) {
    // Fallback for legacy string-based icons (if they were stored as just Lucide IDs)
    return { type: 'icon', value: iconStr };
  }
  return null;
}
