import { invoke } from '@tauri-apps/api/core';

export interface GeneralSettings {
  close_action: 'tray' | 'quit';
  keep_dock_icon: boolean;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  close_action: 'tray',
  keep_dock_icon: true,
};

const STORAGE_KEY_GENERAL_SETTINGS = 'skillhub_general_settings';

/**
 * 获取通用偏好设置
 */
export async function getGeneralSettings(): Promise<GeneralSettings> {
  try {
    const settings = await invoke<GeneralSettings>('get_general_settings');
    if (settings && typeof settings === 'object') {
      try {
        localStorage.setItem(STORAGE_KEY_GENERAL_SETTINGS, JSON.stringify(settings));
      } catch {
        // ignore localStorage error
      }
      return settings;
    }
  } catch (err) {
    console.warn('Failed to fetch general settings from backend, falling back to local cache:', err);
  }

  // 降级使用 local cache
  try {
    const cached = localStorage.getItem(STORAGE_KEY_GENERAL_SETTINGS);
    if (cached) {
      return { ...DEFAULT_GENERAL_SETTINGS, ...JSON.parse(cached) };
    }
  } catch {
    // ignore
  }

  return DEFAULT_GENERAL_SETTINGS;
}

/**
 * 保存通用偏好设置
 */
export async function saveGeneralSettings(settings: GeneralSettings): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY_GENERAL_SETTINGS, JSON.stringify(settings));
  } catch {
    // ignore
  }

  try {
    await invoke('update_general_settings', { settings });
  } catch (err) {
    console.error('Failed to update general settings in backend:', err);
    throw err;
  }

  window.dispatchEvent(new CustomEvent('skillhub_general_settings_changed', { detail: settings }));
}
