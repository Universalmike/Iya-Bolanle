import React from "react";
import { ui } from "./i18n";
import { LanguageSelect, Notice } from "./components";

export default function LoginScreen({
  lang, languagePref, onChangeLanguage, username, password, setUsername, setPassword,
  onLogin, onSignup, notice, onDismissNotice,
}) {
  const submit = (e) => {
    e.preventDefault();
    onLogin();
  };

  return (
    <main className="login">
      <div className="login-top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">₦</span>
          <div>
            <h1 className="brand-name">SARA</h1>
            <p className="brand-tagline">{ui("tagline", lang)}</p>
          </div>
        </div>
        <LanguageSelect value={languagePref} onChange={onChangeLanguage} lang={lang} />
      </div>

      {notice && (
        <div style={{ marginBottom: 14 }}>
          <Notice kind={notice.ok ? "success" : "error"} onDismiss={onDismissNotice} lang={lang}>
            {notice.text}
          </Notice>
        </div>
      )}

      <form onSubmit={submit}>
        <div className="field">
          <label className="field-label" htmlFor="login-username">{ui("usernamePlaceholder", lang)}</label>
          <input
            id="login-username"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck="false"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="login-password">{ui("passwordPlaceholder", lang)}</label>
          <input
            id="login-password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="btn-row" style={{ marginTop: 6 }}>
          <button type="submit" className="btn btn-primary btn-lg">{ui("login", lang)}</button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={onSignup}>{ui("signup", lang)}</button>
        </div>
      </form>

      <p className="login-info">{ui("loginInfo", lang)}</p>
    </main>
  );
}
