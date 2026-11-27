import { invoke } from '@tauri-apps/api/core';

export interface GeneralSettings {
  close_action: 'tray' | 'quit';
  keep_dock_icon: boolean;
  /** 是否随操作系统登录自动启动 */
  autostart: boolean;
  /** 开机自启时是否静默隐藏主窗口至菜单栏/系统托盘 */
  autostart_silent: boolean;
  /** 是否允许在应用启动及后台每小时静默自动同步 GitHub 仓库（默认关闭，省流） */
  auto_sync_repos: boolean;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  close_action: 'tray',
  keep_dock_icon: true,
  autostart: false,
  autostart_silent: true,
  auto_sync_repos: false,
};

const STORAGE_KEY_GENERAL_SETTINGS = 'skillhub_general_settings';

function normalizeSettings(raw: Partial<GeneralSettings> & { close_action?: string }): GeneralSettings {
  return {
    close_action: raw.close_action === 'quit' ? 'quit' : 'tray',
    keep_dock_icon: raw.keep_dock_icon ?? DEFAULT_GENERAL_SETTINGS.keep_dock_icon,
    autostart: raw.autostart ?? DEFAULT_GENERAL_SETTINGS.autostart,
    autostart_silent: raw.autostart_silent ?? DEFAULT_GENERAL_SETTINGS.autostart_silent,
    auto_sync_repos: raw.auto_sync_repos ?? DEFAULT_GENERAL_SETTINGS.auto_sync_repos,
  };
}

/**
 * 获取通用偏好设置
 */
export async function getGeneralSettings(): Promise<GeneralSettings> {
  try {
    const settings = await invoke<GeneralSettings>('get_general_settings');
    if (settings && typeof settings === 'object') {
      const normalized = normalizeSettings(settings);
      try {
        localStorage.setItem(STORAGE_KEY_GENERAL_SETTINGS, JSON.stringify(normalized));
      } catch {
        // ignore localStorage error
      }
      return normalized;
    }
  } catch (err) {
    console.warn('Failed to fetch general settings from backend, falling back to local cache:', err);
  }

  // 降级使用 local cache
  try {
    const cached = localStorage.getItem(STORAGE_KEY_GENERAL_SETTINGS);
    if (cached) {
      return normalizeSettings(JSON.parse(cached));
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
    await invoke('update_general_settings', { settings });
  } catch (err) {
    console.error('Failed to update general settings in backend:', err);
    throw err;
  }

  try {
    localStorage.setItem(STORAGE_KEY_GENERAL_SETTINGS, JSON.stringify(settings));
  } catch {
    // ignore
  }

  window.dispatchEvent(new CustomEvent('skillhub_general_settings_changed', { detail: settings }));
}
