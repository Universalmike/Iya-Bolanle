import React from "react";
import Icon from "./Icon";
import { ui, languageLabel } from "./i18n";
import { LanguageSelect } from "./components";
import { naira } from "./format";

const greetingKey = (hour) => (hour < 12 ? "greetingMorning" : hour < 17 ? "greetingAfternoon" : "greetingEvening");

// Quick buttons send fixed English text with quick: true, so the server keeps the
// user's language instead of switching to English.
const QUICK_ACTIONS = [
  { key: "quickBalance", icon: "wallet", text: "check balance" },
  { key: "quickAirtime", icon: "phone", text: "buy 100 airtime" },
  { key: "quickHistory", icon: "chart", history: true },
  { key: "quickPayAjo", icon: "group", text: "pay my ajo" },
];

export default function ChatScreen({
  lang, username, balance, onRefreshBalance, refreshing,
  languagePref, onChangeLanguage, languageSuggestion, onAcceptSuggestion, onDismissSuggestion,
  messages, isThinking, awaitingConfirm, chatEndRef,
  input, setInput, onSend, onHistory, isListening, onStartListening, onStopListening,
}) {
  // Yes/No go inside SARA's latest message while she is waiting for an answer.
  const lastSara = messages.map((m) => m.role).lastIndexOf("assistant");
  const typing = input.trim().length > 0;

  const submit = (e) => {
    e.preventDefault();
    if (typing && !isThinking) onSend();
  };

  return (
    <section className="screen screen--chat">
      <header className="chat-header">
        <div className="greeting">
          <span className="greeting-hello">{ui(greetingKey(new Date().getHours()), lang)}</span>
          <span className="greeting-name">{username}</span>
        </div>
        <LanguageSelect value={languagePref} onChange={onChangeLanguage} lang={lang} />
      </header>

      {balance !== null && (
        <div className="balance-card">
          <div>
            <div className="balance-label">{ui("yourBalance", lang)}</div>
            <div className="balance-amount">{naira(balance)}</div>
          </div>
          <button
            type="button"
            className={`icon-btn${refreshing ? " is-busy" : ""}`}
            onClick={onRefreshBalance}
            aria-label={ui("refreshBalance", lang)}
          >
            <Icon name="refresh" size={20} />
          </button>
        </div>
      )}

      <div className="messages" role="log" aria-live="polite" aria-label={ui("messagesLabel", lang)}>
        {messages.map((m, idx) =>
          m.role === "notice" ? (
            <div key={idx} className="bubble bubble--notice notice notice--gold">
              <Icon name="arrowIn" size={20} />
              <span className="notice-text">{m.text}</span>
            </div>
          ) : (
            <div key={idx} className={`bubble ${m.role === "user" ? "bubble--user" : "bubble--sara"}`}>
              {m.text}
              {awaitingConfirm && idx === lastSara && !isThinking && (
                <div className="bubble-actions">
                  <button type="button" className="btn btn-primary" onClick={() => onSend("yes")}>
                    {ui("confirmYes", lang)}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => onSend("no")}>
                    {ui("confirmNo", lang)}
                  </button>
                </div>
              )}
            </div>
          )
        )}
        {isThinking && (
          <div className="bubble bubble--sara thinking" aria-label={ui("thinking", lang)}>
            <span className="dots" aria-hidden="true"><span></span><span></span><span></span></span>
            {ui("thinking", lang)}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {languageSuggestion && (
        <div className="chip-row">
          <button type="button" className="chip chip--accent" onClick={() => onAcceptSuggestion(languageSuggestion)}>
            {ui("switchTo", languageSuggestion, languageLabel(languageSuggestion))}
          </button>
          <button type="button" className="chip" onClick={onDismissSuggestion} aria-label={ui("dismiss", lang)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      <div className="chip-row" role="group" aria-label={ui("quickActionsLabel", lang)}>
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            className="chip"
            disabled={isThinking}
            onClick={() => (a.history ? onHistory() : onSend(a.text, { quick: true }))}
          >
            <Icon name={a.icon} size={18} />
            {ui(a.key, lang)}
          </button>
        ))}
      </div>

      <form className="composer" onSubmit={submit}>
        <label htmlFor="chat-input" className="sr-only">{ui("messageLabel", lang)}</label>
        <input
          id="chat-input"
          className="composer-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isListening ? ui("listening", lang) : ui("inputPlaceholder", lang)}
          disabled={isThinking}
          autoComplete="off"
        />
        {/* The big button is the mic; once the user types it becomes Send. */}
        {typing ? (
          <button type="submit" className="mic-btn mic-btn--send" disabled={isThinking} aria-label={ui("send", lang)}>
            <Icon name="send" size={26} />
          </button>
        ) : (
          <button
            type="button"
            className={`mic-btn${isListening ? " mic-btn--listening" : ""}`}
            onClick={isListening ? onStopListening : () => onStartListening()}
            disabled={isThinking}
            aria-label={ui(isListening ? "stopListening" : "talkToSara", lang)}
            aria-pressed={isListening}
          >
            <Icon name={isListening ? "stop" : "mic"} size={28} strokeWidth={2.2} />
          </button>
        )}
      </form>
    </section>
  );
}
