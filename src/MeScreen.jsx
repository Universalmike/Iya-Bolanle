import React from "react";
import Icon from "./Icon";
import { ui } from "./i18n";
import { LanguageSelect, PageHeader } from "./components";

const THEME_OPTIONS = [
  { value: "system", label: "themeSystem", icon: "phone" },
  { value: "light", label: "themeLight", icon: "sun" },
  { value: "dark", label: "themeDark", icon: "moon" },
];

export default function MeScreen({ lang, username, languagePref, onChangeLanguage, theme, onChangeTheme, onLogout }) {
  const tr = (key) => ui(key, lang);
  return (
    <section className="screen">
      <PageHeader title={tr("meTitle")} />

      <div className="card profile">
        <span className="avatar" aria-hidden="true">{username.slice(0, 1)}</span>
        <div>
          <div className="meta">{tr("signedInAs")}</div>
          <div className="profile-name">{username}</div>
        </div>
      </div>

      <div className="card settings">
        <div className="field">
          <label className="field-label" htmlFor="me-language">{tr("languageSetting")}</label>
          <LanguageSelect id="me-language" className="select" value={languagePref} onChange={onChangeLanguage} lang={lang} />
          <span className="meta">{tr("languageHint")}</span>
        </div>

        <div className="field">
          <span className="field-label" id="me-theme">{tr("appearance")}</span>
          <div className="segmented" role="group" aria-labelledby="me-theme">
            {THEME_OPTIONS.map((o) => (
              <button key={o.value} type="button" aria-pressed={theme === o.value} onClick={() => onChangeTheme(o.value)}>
                <Icon name={o.icon} size={18} />
                {tr(o.label)}
              </button>
            ))}
          </div>
          <span className="meta">{tr("themeHint")}</span>
        </div>
      </div>

      <button type="button" className="btn btn-danger btn-block" onClick={onLogout}>
        <Icon name="logout" size={18} />
        {tr("logout")}
      </button>
    </section>
  );
}
