// Small building blocks shared by SARA's screens.
import React from "react";
import Icon from "./Icon";
import { LANGUAGE_OPTIONS, ui } from "./i18n";

// The four tabs at the bottom of the app.
const TABS = [
  { id: "chat", icon: "chat", label: "tabChat" },
  { id: "esusu", icon: "group", label: "tabEsusu" },
  { id: "bills", icon: "receipt", label: "tabBills" },
  { id: "me", icon: "user", label: "tabMe" },
];

export function TabBar({ tab, onChange, lang }) {
  return (
    <nav className="tabbar" aria-label={ui("mainNav", lang)}>
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="tab"
          aria-current={tab === t.id ? "page" : undefined}
          onClick={() => onChange(t.id)}
        >
          <span className="tab-icon">
            <Icon name={t.icon} />
          </span>
          {ui(t.label, lang)}
        </button>
      ))}
    </nav>
  );
}

export function LanguageSelect({ value, onChange, lang, className = "lang-chip", id }) {
  return (
    <select
      id={id}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={id ? undefined : ui("languageAria", lang)}
    >
      {LANGUAGE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const NOTICE_ICONS = { success: "check", error: "alert", gold: "info", info: "info" };

// A message banner. kind: success | error | gold | info. onDismiss adds a close button.
export function Notice({ kind = "info", children, onDismiss, lang, icon }) {
  return (
    <div className={`notice notice--${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon name={icon || NOTICE_ICONS[kind]} size={20} />
      <span className="notice-text">{children}</span>
      {onDismiss && (
        <button type="button" className="icon-btn" onClick={onDismiss} aria-label={ui("dismiss", lang)}>
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="page-header">
      {children}
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </header>
  );
}
