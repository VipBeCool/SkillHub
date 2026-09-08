/**
 * 资源社区设置持久化管理
 */

export const STORAGE_KEY_DEFAULT_INSTALL_DIR = 'skillhub_default_install_dir_id';

/**
 * 获取当前配置的默认安装技能库 ID
 * @returns 技能库 SourceDirectory.id 或 null（表示每次询问）
 */
export function getDefaultInstallDirId(): string | null {
  try {
    const val = localStorage.getItem(STORAGE_KEY_DEFAULT_INSTALL_DIR);
    return val && val.trim() !== '' ? val.trim() : null;
  } catch {
    return null;
  }
}

/**
 * 设置默认安装技能库 ID
 * @param dirId 目标技能库 ID，传 null 或 '' 表示“每次安装时询问”
 */
export function setDefaultInstallDirId(dirId: string | null): void {
  try {
    if (!dirId || dirId.trim() === '') {
      localStorage.removeItem(STORAGE_KEY_DEFAULT_INSTALL_DIR);
    } else {
      localStorage.setItem(STORAGE_KEY_DEFAULT_INSTALL_DIR, dirId.trim());
    }
    // 派发自定义事件以便跨组件实时响应
    window.dispatchEvent(new Event('skillhub_default_install_dir_changed'));
  } catch (err) {
    console.error('Failed to save default install directory setting:', err);
  }
}
