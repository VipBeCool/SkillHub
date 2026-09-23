export const STORAGE_KEY_GITHUB_TOKEN = 'skillhub_github_token';

/**
 * 获取本地保存的 GitHub Personal Access Token
 */
export function getGitHubToken(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN) || '';
  } catch {
    return '';
  }
}

/**
 * 保存 GitHub Personal Access Token
 */
export function setGitHubToken(token: string): void {
  try {
    const trimmed = token.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY_GITHUB_TOKEN);
    }
    window.dispatchEvent(new Event('skillhub_github_token_changed'));
  } catch (err) {
    console.error('Failed to save GitHub token:', err);
  }
}

/**
 * 移除 GitHub Personal Access Token
 */
export function removeGitHubToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_GITHUB_TOKEN);
    window.dispatchEvent(new Event('skillhub_github_token_changed'));
  } catch (err) {
    console.error('Failed to remove GitHub token:', err);
  }
}
