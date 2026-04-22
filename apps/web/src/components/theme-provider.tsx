"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";

type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "kiju-theme-mode-v1";
const ThemeContext = createContext<ThemeContextValue | null>(null);

const isThemeMode = (value: string | undefined | null): value is ThemeMode =>
  value === "light" || value === "dark";

const getInitialTheme = (): ThemeMode => {
  if (typeof window === "undefined") {
    return "light";
  }

  const documentTheme = document.documentElement.dataset["theme"];
  if (isThemeMode(documentTheme)) {
    return documentTheme;
  }

  const storedTheme = window.localStorage.getItem(STORAGE_KEY);
  if (isThemeMode(storedTheme)) {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [isThemeReady, setIsThemeReady] = useState(false);

  useEffect(() => {
    setTheme(getInitialTheme());
    setIsThemeReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isThemeReady) return;

    document.documentElement.dataset["theme"] = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [isThemeReady, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((current) => (current === "light" ? "dark" : "light"))
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
};
