import { useState, useEffect } from "react";
import { Theme, getTheme, setTheme } from "../../lib/theme";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";

const ORDER: Theme[] = ["system", "light", "dark"];

export function ThemeToggle() {
  const [themeState, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  const next = () => {
    const n = ORDER[(ORDER.indexOf(themeState) + 1) % ORDER.length] ?? "system";
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
      <span className="label">{themeState}</span>
    </Button>
  );
}
