// 外观偏好独立于账户数据。页面显示时读取，不注册跨页监听器。
export const THEME_STORAGE_KEY = 'ui-theme';
export const DEFAULT_THEME = 'warm';
export const THEMES = Object.freeze([
  Object.freeze({ id: 'warm', label: '暖白', description: '柔和、干净', paper: '#f7f7f2', raised: '#fbfbf6', line: '#e7e8df', input: '#f4f5ef', secondary: '#ecefe4', handle: '#daddd1' }),
  Object.freeze({ id: 'violet', label: '雾紫', description: '安静一点', paper: '#f1edf8', raised: '#f9f6fd', line: '#e1dbea', input: '#f1edf7', secondary: '#e9e3f3', handle: '#d8cfe4' }),
  Object.freeze({ id: 'green', label: '浅绿', description: '清新一点', paper: '#edf3e8', raised: '#f6faf2', line: '#dce5d5', input: '#eef4e9', secondary: '#e3ecd9', handle: '#d0ddc6' }),
]);

function findTheme(id) { return THEMES.find(theme => theme.id === id); }

export function getThemeStyle(id) {
  const theme = findTheme(id) || THEMES[0];
  return {
    '--auth-paper': theme.paper,
    '--auth-raised': theme.raised,
    '--auth-line': theme.line,
    '--auth-input': theme.input,
    '--auth-secondary': theme.secondary,
    '--auth-handle': theme.handle,
  };
}

export function readTheme() {
  try {
    const id = uni.getStorageSync(THEME_STORAGE_KEY);
    return findTheme(id) ? id : DEFAULT_THEME;
  } catch (_) { return DEFAULT_THEME; }
}

export function saveTheme(id) {
  if (!findTheme(id)) return false;
  try {
    uni.setStorageSync(THEME_STORAGE_KEY, id);
    return true;
  } catch (_) { return false; }
}
