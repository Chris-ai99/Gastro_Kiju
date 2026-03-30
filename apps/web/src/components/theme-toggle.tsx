"use client";

import { MoonStar, SunMedium } from "lucide-react";

import { useTheme } from "./theme-provider";

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="kiju-theme-toggle" role="group" aria-label="Farbthema wählen">
      <button
        type="button"
        className={`kiju-theme-toggle__button ${theme === "light" ? "is-active" : ""}`}
        onClick={() => setTheme("light")}
      >
        <SunMedium size={16} />
        Hell
      </button>
      <button
        type="button"
        className={`kiju-theme-toggle__button ${theme === "dark" ? "is-active" : ""}`}
        onClick={() => setTheme("dark")}
      >
        <MoonStar size={16} />
        Schwarz
      </button>
    </div>
  );
};
