import { useState } from "react";
import { THEMES, type Theme, getTheme, setTheme } from "../../lib/theme";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";

export function ThemeToggle() {
  const [themeState, setThemeState] = useState<Theme>(getTheme);

  const next = () => {
    const n = THEMES[(THEMES.indexOf(themeState) + 1) % THEMES.length] ?? "system";
    setTheme(n);
    setThemeState(n);
  };

  const getIcon = () => {
    if (themeState === 'light') return 'Sun';
    if (themeState === 'dark') return 'Moon';
    return 'Monitor';
  };

  return (
    <Button
      size="sm"
      onClick={next}
      aria-label={`Theme: ${themeState}. Activate to change.`}
      title={`Theme: ${themeState}`}
      icon={<Icon name={getIcon()} size={16} aria-hidden />}
    >
      <span className="label max-sm:sr-only">{themeState}</span>
    </Button>
  );
}
