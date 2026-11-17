// Light / dark / follow-the-phone appearance. "system" removes data-theme so the
// prefers-color-scheme rules in index.css decide. index.html applies the saved
// choice before React loads, so the page never flashes the wrong theme.

export const THEMES = ["system", "light", "dark"];
const KEY = "sara_theme";

export const loadTheme = () => {
  try {
    const value = localStorage.getItem(KEY);
    return THEMES.includes(value) ? value : "system";
  } catch {
    return "system";
  }
};

export const saveTheme = (value) => {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // not fatal: the choice just won't be remembered
  }
};

const isDark = (choice) =>
  choice === "dark" || (choice === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);

export const applyTheme = (choice) => {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  // The phone's browser bar colour.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark(choice) ? "#0f1512" : "#f7f4ec");
};
