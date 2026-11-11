export const THEME_KEY = 'theme_preference';

export function applyTheme(theme) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');
  root.classList.add(nextTheme === 'light' ? 'theme-light' : 'theme-dark');
  root.style.colorScheme = nextTheme;
  localStorage.setItem(THEME_KEY, nextTheme);
  return nextTheme;
}

export function getSavedTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === 'light' ? 'light' : 'dark';
}
