export type Theme = 'light' | 'dark' | 'system';

export function getTheme(): Theme {
  try {
    return (localStorage.getItem('theme') as Theme) || 'system';
  } catch {
    return 'system';
  }
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // Ignore storage errors
  }
  applyTheme(theme);
}

export function applyTheme(theme: Theme) {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const root = document.documentElement;
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');
  root.style.colorScheme = isDark ? 'dark' : 'light';
  
  // Update meta theme-color
  let metaTheme = document.querySelector('meta[name="theme-color"]');
  if (!metaTheme) {
    metaTheme = document.createElement('meta');
    metaTheme.setAttribute('name', 'theme-color');
    document.head.appendChild(metaTheme);
  }
  metaTheme.setAttribute('content', isDark ? '#0B1120' : '#F8FAFC');
}
