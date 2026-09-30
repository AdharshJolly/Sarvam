import { useState } from "react";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];

function apply(theme: Theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const next = () => {
    const n = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] ?? "system";
    apply(n);
    setTheme(n);
  };
  return (
    <button
      type="button"
      onClick={next}
      className="btn text-sm"
      aria-label={`Theme: ${theme}. Activate to change.`}
    >
      Theme: {theme}
    </button>
  );
}
