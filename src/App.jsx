import React, { useEffect, useState, useRef, useCallback } from "react";
import { api, loadSession, saveSession, clearSession, UNAUTHORIZED_EVENT } from "./api";
import EsusuView from "./EsusuView";
import {
  LANGUAGE_OPTIONS, SPEECH_CODES, languageLabel, ui, loadLanguageChoice, saveLanguageChoice,
} from "./i18n";

// Phone photos are often 3-10MB; shrink to a JPEG that is still sharp enough to read.
// Falls back to the original file if the browser can't decode it (e.g. HEIC on Chrome).
const shrinkImage = (file, maxSide = 1600, quality = 0.85) =>
  new Promise((resolve, reject) => {
    const readOriginal = () => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    };
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      readOriginal();
    };
    img.src = url;
  });

// Picks a browser voice for the language. Most browsers have no Yoruba, Igbo or
// Hausa voice; then the (accent-stripped) text is read by a Nigerian/English voice.
const pickVoice = (code) => {
  const voices = window.speechSynthesis.getVoices();
  const lower = code.toLowerCase();
  const base = lower.split("-")[0];
  return (
    voices.find((v) => v.lang.toLowerCase() === lower) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(`${base}-`)) ||
    null
  );
};

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // True while a saved session is being checked on page load
  const [isRestoring, setIsRestoring] = useState(() => Boolean(loadSession()));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  // True while SARA is waiting for "yes"/"no" on a transfer or airtime purchase
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  // The language SARA is currently replying in, the saved preference
  // ("auto" or a language), and an offer to switch when the user writes in another one.
  const [language, setLanguage] = useState("english");
  const [languagePref, setLanguagePref] = useState(() => loadLanguageChoice());
  const [languageSuggestion, setLanguageSuggestion] = useState(null);
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const chatEndRef = useRef(null);
  const [showEsusu, setShowEsusu] = useState(false);
  const [esusuGroups, setEsusuGroups] = useState([]);
  const [showBillScanner, setShowBillScanner] = useState(false);
  const [scannedBill, setScannedBill] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isPayingBill, setIsPayingBill] = useState(false);
  const [billAmount, setBillAmount] = useState("");
  const [billNotice, setBillNotice] = useState("");
  const fileInputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ------------------------- Language -------------------------
  // Every server reply says which language it used; keep the UI in step.
  const applyLanguage = (data) => {
    if (data?.language) setLanguage(data.language);
    if (data?.languagePreference) {
      setLanguagePref(data.languagePreference);
      saveLanguageChoice(data.languagePreference);
    }
    setLanguageSuggestion(data?.languageSuggestion ?? null);
  };

  const addAssistantMessage = (text) => setMessages((prev) => [...prev, { role: "assistant", text }]);

  // ------------------------- TTS -------------------------
  const speakText = (text, lang = language) => {
    if (!("speechSynthesis" in window) || !text) return;

    // Remove emojis and special characters for speech
    const cleanText = text
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis (proper unicode range)
      .replace(/[\u{2600}-\u{26FF}]/gu, '') // Remove misc symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, '') // Remove dingbats
      .replace(/₦/g, 'Naira ') // Replace Naira symbol with word
      .trim();

    const utter = new SpeechSynthesisUtterance(cleanText);
    const voice = pickVoice(SPEECH_CODES[lang] || "en-NG");
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    } else {
      utter.lang = "en-NG";
    }
    utter.rate = 1.1;
    utter.pitch = 1.0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  };

  // Shows and speaks a server reply (success or error) and syncs the language.
  const showReply = (data, fallbackText) => {
    const text = data?.message || fallbackText;
    addAssistantMessage(text);
    applyLanguage(data);
    speakText(data?.speak || text, data?.language || language);
  };

  // Sent with signup/login so their messages come back in the chosen language.
  const loginLanguage = () => (languagePref !== "auto" ? languagePref : undefined);

  const changeLanguage = async (value) => {
    setLanguageSuggestion(null);
    if (!isLoggedIn) {
      setLanguagePref(value);
      saveLanguageChoice(value);
      return;
    }
    try {
      const res = await api.put("/me/language", { language: value });
      showReply(res.data);
    } catch (err) {
      showReply(err.response?.data, ui("genericError", language));
    }
  };

  // ------------------------- Auth -------------------------
  // Field validation happens on the server so its messages are translated.
  const handleSignup = async () => {
    try {
      const res = await api.post(`/signup`, { username, password, language: loginLanguage() });
      alert(res.data.message);
    } catch (err) {
      alert(err.response?.data?.message || ui("genericError", language));
    }
  };

  const handleLogin = async () => {
    try {
      const res = await api.post(`/login`, { username, password, language: loginLanguage() });
      saveSession({ token: res.data.token, username: res.data.username });
      setUsername(res.data.username);
      setPassword("");
      setIsLoggedIn(true);
      applyLanguage(res.data);
      setMessages([{ role: "assistant", text: res.data.welcomeMessage }]);
      speakText(res.data.welcomeMessage, res.data.language);
    } catch (err) {
      alert(err.response?.data?.message || ui("genericError", language));
    }
  };

  const logout = useCallback(() => {
    clearSession();
    window.speechSynthesis?.cancel();
    setIsLoggedIn(false);
    setMessages([]);
    setAwaitingConfirm(false);
    setLanguageSuggestion(null);
    setUsername("");
    setPassword("");
    setShowEsusu(false);
    setShowBillScanner(false);
    setEsusuGroups([]);
    setScannedBill(null);
    setBillNotice("");
    setBillAmount("");
  }, []);

  // Restore a saved session on page load (the token is checked by the server).
  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    api
      .get("/me")
      .then((res) => {
        setUsername(res.data.username);
        setIsLoggedIn(true);
        applyLanguage(res.data);
        setMessages([{ role: "assistant", text: res.data.welcomeMessage }]);
      })
      .catch(() => clearSession())
      .finally(() => setIsRestoring(false));
    // applyLanguage only calls state setters, so running once on mount is correct.
  }, []);

  // The API client fires this when the server rejects the token (expired/invalid).
  const languageRef = useRef(language);
  languageRef.current = language;
  useEffect(() => {
    const onUnauthorized = () => {
      logout();
      alert(ui("sessionExpired", languageRef.current));
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [logout]);

  // ------------------------- Esusu Functions -------------------------
  const fetchEsusuGroups = async () => {
    try {
      const res = await api.get(`/esusu/my-groups`);
      setEsusuGroups(res.data.groups || []);
    } catch {
      console.error("Could not fetch esusu groups");
    }
  };

  // Every Esusu button (create, join, start, shuffle, leave, remove, contribute)
  // goes through here: SARA's reply is added to the chat and the list refreshed.
  // The Esusu screen also shows the reply, since the chat is hidden while it's open.
  const esusuAction = async (path, body) => {
    try {
      const res = await api.post(`/esusu/${path}`, body);
      showReply(res.data);
      await fetchEsusuGroups();
      return { ok: true, message: res.data.message };
    } catch (err) {
      const message = err.response?.data?.message || ui("genericError", language);
      showReply(err.response?.data, message);
      await fetchEsusuGroups();
      return { ok: false, message };
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchEsusuGroups();
    }
  }, [isLoggedIn]);

  // ------------------------- Bill Scanner Functions -------------------------
  // The server reads the photo with Gemini and stores the bill; we only send its id to pay.
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    event.target.value = ""; // lets the same photo be picked again after an error
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert(ui("notAnImage", language));
      return;
    }

    setIsScanning(true);
    setScannedBill(null);
    setBillNotice("");
    try {
      const imageData = await shrinkImage(file);
      const res = await api.post(`/scan-bill`, { imageData });
      setScannedBill(res.data.billData);
      setBillAmount(res.data.billData.amount ? String(res.data.billData.amount) : "");
      setBillNotice(res.data.message);
      showReply(res.data);
    } catch (err) {
      const message = err.response?.data?.message || ui("scanFailed", language);
      setBillNotice(message);
      showReply(err.response?.data, message);
    } finally {
      setIsScanning(false);
    }
  };

  const handlePayBill = async () => {
    if (!scannedBill || isPayingBill) return;
    setIsPayingBill(true);
    try {
      const amount = Number(billAmount.replace(/[₦,\s]/g, ""));
      const res = await api.post(`/pay-bill`, { billId: scannedBill.id, amount: amount || null });
      showReply(res.data);
      setScannedBill(null);
      setBillNotice("");
      setShowBillScanner(false);
    } catch (err) {
      const message = err.response?.data?.message || ui("genericError", language);
      setBillNotice(message);
      showReply(err.response?.data, message);
      // Already paid or expired: this scan can't be used again.
      if ([404, 409, 410].includes(err.response?.status)) setScannedBill(null);
    } finally {
      setIsPayingBill(false);
    }
  };

  // ------------------------- Fetch History -------------------------
  // The server formats and translates the history.
  const fetchHistory = async () => {
    setIsThinking(true);
    try {
      const res = await api.get(`/history`);
      showReply(res.data);
    } catch (err) {
      showReply(err.response?.data, ui("genericError", language));
    } finally {
      setIsThinking(false);
    }
  };

  // ------------------------- Send Action -------------------------
  // quick: true for the quick-action buttons. Their text is fixed English, so the
  // server shouldn't treat it as the user switching to English.
  const handleSend = async (explicitText, { quick = false } = {}) => {
    const text = explicitText ?? input;
    if (!text.trim() || !isLoggedIn) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setIsThinking(true);

    try {
      const res = await api.post(`/action`, { text, quick });
      showReply(res.data);
      setAwaitingConfirm(Boolean(res.data.awaitingConfirmation));
    } catch (err) {
      showReply(err.response?.data, ui("genericError", language));
      setAwaitingConfirm(false);
    } finally {
      setIsThinking(false);
    }
  };

  // ------------------------- Speech recognition -------------------------
  // Listens in the current language. If the browser can't recognise it (common
  // for Yoruba, Igbo and Hausa), falls back to Nigerian English.
  const startListening = (code = SPEECH_CODES[language] || "en-NG") => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      addAssistantMessage(ui("voiceUnsupported", language));
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = code;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let fallingBack = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      recognition.stop();
      handleSend(transcript);
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error === "language-not-supported" && code !== "en-NG") {
        fallingBack = true;
        addAssistantMessage(ui("voiceLanguageFallback", language));
        return;
      }
      if (event.error !== "aborted") addAssistantMessage(ui("couldNotHear", language));
    };
    recognition.onend = () => {
      setIsListening(false);
      if (fallingBack) startListening("en-NG");
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch (err) {
      console.log("Stop listening error:", err);
    }
    setIsListening(false);
  };

  const languagePicker = (
    <select
      value={languagePref}
      onChange={(e) => changeLanguage(e.target.value)}
      style={styles.languageSelect}
      aria-label="Language"
    >
      {LANGUAGE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );

  // ------------------------- Render -------------------------
  if (isRestoring) {
    return (
      <div style={styles.container}>
        <p style={styles.subtitle}>Loading SARA…</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.header}>
            <div>
              <h1 style={styles.title}>💸 SARA</h1>
              <p style={styles.subtitle}>Your Personal Financial Assistant</p>
            </div>
            {languagePicker}
          </div>
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleLogin} style={styles.buttonPrimary}>
              Login
            </button>
            <button onClick={handleSignup} style={styles.buttonSecondary}>
              Sign Up
            </button>
          </div>
          <p style={styles.infoText}>
            🔒 Your account is securely stored. New here? Sign up to get started with ₦10,000!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h2 style={styles.title}>💸 SARA — Chat with your assistant</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {languagePicker}
            <button
              onClick={() => {
                setShowEsusu(false);
                setShowBillScanner(!showBillScanner);
                setBillNotice("");
              }}
              style={{
                ...styles.esusuButton,
                background: showBillScanner ? "#7c3aed" : "rgba(124,58,237,0.1)"
              }}
            >
              {showBillScanner ? "💬 Chat" : "📄 Scan Bill"}
            </button>
            <button 
              onClick={() => {
                setShowBillScanner(false);
                setShowEsusu(!showEsusu);
              }} 
              style={{
                ...styles.esusuButton,
                background: showEsusu ? "#7c3aed" : "rgba(124,58,237,0.1)"
              }}
            >
              {showEsusu ? "💬 Chat" : "🤝 Esusu"}
            </button>
            <button 
              onClick={logout}
              style={styles.logoutButton}
            >
              Logout
            </button>
          </div>
        </div>

        {showBillScanner ? (
          <BillScannerView
            onImageUpload={handleImageUpload}
            scannedBill={scannedBill}
            isScanning={isScanning}
            onPayBill={handlePayBill}
            fileInputRef={fileInputRef}
            notice={billNotice}
            amount={billAmount}
            onAmountChange={setBillAmount}
            isPaying={isPayingBill}
          />
        ) : showEsusu ? (
          <EsusuView groups={esusuGroups} onAction={esusuAction} styles={styles} />
        ) : (
          <>
            <div style={styles.chatWindow}>
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    ...styles.bubble,
                    background: m.role === "user" ? "#1f2937" : "#4b5563",
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "80%",
                  }}
                >
                  {m.text}
                </div>
              ))}
              {isThinking && (
                <div style={{ ...styles.bubble, background: "#4b5563" }}>
                  {ui("thinking", language)}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {awaitingConfirm && (
              <div style={styles.confirmBar}>
                <button
                  onClick={() => handleSend("yes")}
                  style={styles.confirmYes}
                  disabled={isThinking}
                >
                  {ui("confirmYes", language)}
                </button>
                <button
                  onClick={() => handleSend("no")}
                  style={styles.confirmNo}
                  disabled={isThinking}
                >
                  {ui("confirmNo", language)}
                </button>
              </div>
            )}

            {languageSuggestion && (
              <div style={styles.confirmBar}>
                <button
                  onClick={() => changeLanguage(languageSuggestion)}
                  style={styles.quickButton}
                >
                  🌐 {ui("switchTo", languageSuggestion, languageLabel(languageSuggestion))}
                </button>
                <button
                  onClick={() => setLanguageSuggestion(null)}
                  style={styles.backButton}
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}

            <div style={styles.quickActions}>
              <button 
                onClick={() => handleSend("check balance", { quick: true })}
                style={styles.quickButton}
                disabled={isThinking}
              >
                💰 Balance
              </button>
              <button 
                onClick={() => handleSend("buy 100 airtime", { quick: true })}
                style={styles.quickButton}
                disabled={isThinking}
              >
                📱 Airtime
              </button>
              <button 
                onClick={fetchHistory} 
                style={styles.quickButton}
                disabled={isThinking}
              >
                📊 History
              </button>
            </div>

            <div style={styles.controls}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message or tap the mic..."
                style={styles.chatInput}
                onKeyDown={(e) => e.key === "Enter" && !isThinking && handleSend()}
                disabled={isThinking}
              />
              <button 
                onClick={() => handleSend()} 
                style={styles.sendButton}
                disabled={isThinking || !input.trim()}
              >
                Send
              </button>
              <button 
                onClick={isListening ? stopListening : () => startListening()} 
                style={{
                  ...styles.micButton,
                  background: isListening ? "#ef4444" : "#7c3aed"
                }}
                disabled={isThinking}
              >
                {isListening ? "⏹️" : "🎤"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------- Bill Scanner View Component -------------------------
const BILL_ICONS = { electricity: "⚡", water: "💧", internet: "📡", cable: "📺", other: "🧾" };

const formatBillDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });

function BillScannerView({
  onImageUpload, scannedBill, isScanning, onPayBill, fileInputRef, notice, amount, onAmountChange, isPaying,
}) {
  const amountValue = Number(String(amount).replace(/[₦,\s]/g, ""));
  const canPay = Number.isFinite(amountValue) && amountValue > 0 && !isPaying;
  const rows = scannedBill && [
    ["Account Number", scannedBill.accountNumber],
    ["Meter Number", scannedBill.meterNumber],
    ["Customer Name", scannedBill.customerName],
    ["Bill Period", scannedBill.billPeriod],
    ["Package", scannedBill.package],
    ["Due Date", scannedBill.dueDate && formatBillDate(scannedBill.dueDate) + (scannedBill.overdue ? " ⚠️" : "")],
  ].filter(([, value]) => value);

  return (
    <div style={styles.esusuContainer}>
      <h3 style={styles.esusuTitle}>📄 Scan Your Bill</h3>
      <p style={styles.esusuSubtitle}>Take a photo or upload an image of your utility bill</p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onImageUpload}
        style={{ display: 'none' }}
      />

      {notice && !isScanning && (
        <div style={{ ...styles.infoBox, marginBottom: 16, borderColor: "rgba(124,58,237,0.4)" }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{notice}</p>
        </div>
      )}

      {!scannedBill && !isScanning && (
        <>
          <div style={styles.uploadArea} onClick={() => fileInputRef.current?.click()}>
            <div style={styles.uploadIcon}>📸</div>
            <h4 style={{ margin: "16px 0 8px 0", fontSize: 18 }}>Upload Bill Image</h4>
            <p style={{ margin: 0, fontSize: 14, color: "#94a3b8" }}>
              Tap to take a photo or choose one from your device
            </p>
            <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "#64748b" }}>
              Supports: Electricity, Water, Internet, Cable TV bills
            </p>
          </div>

          <div style={styles.billTypeGrid}>
            {[["⚡", "Electricity"], ["💧", "Water"], ["📡", "Internet"], ["📺", "Cable TV"]].map(([icon, label]) => (
              <div key={label} style={styles.billTypeCard}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{label}</p>
              </div>
            ))}
          </div>

          <div style={styles.infoBox}>
            <h4 style={{ margin: "0 0 8px 0", fontSize: 14 }}>How It Works 💡</h4>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#94a3b8" }}>
              1. Take a clear photo of the whole bill, in good light<br/>
              2. SARA reads the provider, account number and amount<br/>
              3. Check the details and change the amount if you need to<br/>
              4. Tap Pay 🎉
            </p>
          </div>
        </>
      )}

      {isScanning && (
        <div style={styles.scanningContainer}>
          <div style={styles.scanningAnimation}>
            <div style={styles.spinner}></div>
          </div>
          <h4 style={{ margin: "20px 0 8px 0", fontSize: 18 }}>Scanning Bill...</h4>
          <p style={{ margin: 0, fontSize: 14, color: "#94a3b8" }}>
            SARA is reading your bill details
          </p>
        </div>
      )}

      {scannedBill && !isScanning && (
        <div style={styles.billDetailsContainer}>
          <div style={styles.billCard}>
            <div style={styles.billHeader}>
              <h4 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                {BILL_ICONS[scannedBill.billType] || "🧾"} {scannedBill.provider}
              </h4>
              {scannedBill.amount && <div style={styles.billAmount}>₦{scannedBill.amount.toLocaleString()}</div>}
            </div>

            <div style={styles.billDetails}>
              {rows.map(([label, value]) => (
                <div key={label} style={styles.billDetailRow}>
                  <span style={styles.billLabel}>{label}:</span>
                  <span style={styles.billValue}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          <label style={{ display: "block", margin: "20px 0 6px", fontSize: 14, color: "#94a3b8" }}>
            Amount to pay (₦)
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="e.g. 5000"
            style={styles.input}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={onPayBill}
              disabled={!canPay}
              style={{ ...styles.payButton, opacity: canPay ? 1 : 0.5, cursor: canPay ? "pointer" : "not-allowed" }}
            >
              {isPaying ? "Paying..." : canPay ? `Pay ₦${amountValue.toLocaleString()} Now` : "Enter an amount"}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={styles.buttonSecondary}
            >
              Scan Another
            </button>
          </div>

          <div style={styles.securityNote}>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              🔒 Check the account number before you pay. SARA pays the provider shown above.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------- Styles -------------------------
const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(180deg,#0f172a 0%, #060818 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    color: "#fff",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  card: {
    width: 900,
    maxWidth: "95%",
    background: "#0b1220",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 20px 50px rgba(2,6,23,0.9)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: { 
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
  },
  subtitle: {
    margin: "8px 0 0 0",
    fontSize: 16,
    color: "#94a3b8",
  },
  chatWindow: {
    height: "55vh",
    overflowY: "auto",
    padding: 16,
    borderRadius: 12,
    background: "#081127",
    border: "1px solid rgba(255,255,255,0.05)",
    marginBottom: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  bubble: { 
    padding: 14, 
    borderRadius: 12, 
    lineHeight: 1.5, 
    whiteSpace: "pre-wrap",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
  },
  languageSelect: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid rgba(124,58,237,0.3)",
    background: "#0b1220",
    color: "#a78bfa",
    cursor: "pointer",
    fontSize: 14,
  },
  confirmBar: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
  },
  confirmYes: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "#10b981",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 15,
  },
  confirmNo: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.4)",
    background: "rgba(239,68,68,0.1)",
    color: "#f87171",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 15,
  },
  quickActions: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  quickButton: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid rgba(124,58,237,0.3)",
    background: "rgba(124,58,237,0.1)",
    color: "#a78bfa",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    transition: "all 0.2s",
  },
  controls: { 
    display: "flex", 
    gap: 8, 
    alignItems: "center" 
  },
  chatInput: { 
    flex: 1, 
    padding: "12px 16px", 
    borderRadius: 10, 
    border: "1px solid rgba(255,255,255,0.08)", 
    background: "#0b1220", 
    color: "#fff",
    fontSize: 15,
  },
  input: { 
    width: "100%", 
    padding: "12px 16px", 
    borderRadius: 10, 
    border: "1px solid rgba(255,255,255,0.08)", 
    background: "#0b1220", 
    color: "#fff", 
    marginBottom: 12,
    fontSize: 15,
  },
  buttonPrimary: { 
    flex: 1,
    padding: "12px 16px", 
    borderRadius: 10, 
    border: "none", 
    background: "#7c3aed", 
    color: "#fff", 
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 15,
  },
  buttonSecondary: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid rgba(124,58,237,0.5)",
    background: "transparent",
    color: "#a78bfa",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 15,
  },
  sendButton: {
    padding: "12px 24px",
    borderRadius: 10,
    border: "none",
    background: "#7c3aed",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
  micButton: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    color: "#fff",
    cursor: "pointer",
    fontSize: 18,
  },
  logoutButton: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid rgba(239,68,68,0.3)",
    background: "rgba(239,68,68,0.1)",
    color: "#f87171",
    cursor: "pointer",
    fontSize: 14,
  },
  infoText: {
    marginTop: 16,
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
  },
  esusuButton: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid rgba(124,58,237,0.3)",
    color: "#a78bfa",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
  },
  esusuContainer: {
    padding: 16,
    minHeight: "60vh",
  },
  esusuTitle: {
    margin: "0 0 8px 0",
    fontSize: 24,
    fontWeight: 700,
  },
  esusuSubtitle: {
    margin: "0 0 24px 0",
    fontSize: 14,
    color: "#94a3b8",
  },
  backButton: {
    padding: "8px 16px",
    marginBottom: 20,
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "transparent",
    color: "#a78bfa",
    cursor: "pointer",
    fontSize: 14,
  },
  infoBox: {
    padding: 16,
    borderRadius: 10,
    background: "rgba(124,58,237,0.05)",
    border: "1px solid rgba(124,58,237,0.2)",
    marginTop: 16,
    marginBottom: 16,
  },
  groupsList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 20,
  },
  groupCard: {
    padding: 16,
    borderRadius: 12,
    background: "#081127",
    border: "1px solid rgba(255,255,255,0.05)",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  contributeButton: {
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    background: "#10b981",
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  emptyState: {
    textAlign: "center",
    padding: "40px 20px",
    background: "#081127",
    borderRadius: 12,
    marginBottom: 20,
  },
  uploadArea: {
    padding: "60px 20px",
    borderRadius: 16,
    background: "#081127",
    border: "2px dashed rgba(124,58,237,0.3)",
    textAlign: "center",
    cursor: "pointer",
    marginBottom: 24,
    transition: "all 0.3s",
  },
  uploadIcon: {
    fontSize: 64,
    marginBottom: 8,
  },
  billTypeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    marginBottom: 24,
  },
  billTypeCard: {
    padding: 20,
    borderRadius: 12,
    background: "#081127",
    border: "1px solid rgba(255,255,255,0.05)",
    textAlign: "center",
  },
  scanningContainer: {
    padding: "60px 20px",
    textAlign: "center",
  },
  scanningAnimation: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  spinner: {
    width: 60,
    height: 60,
    border: "4px solid rgba(124,58,237,0.1)",
    borderTop: "4px solid #7c3aed",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  billDetailsContainer: {
    animation: "fadeIn 0.5s",
  },
  successBadge: {
    display: "inline-block",
    padding: "8px 16px",
    borderRadius: 20,
    background: "rgba(16,185,129,0.1)",
    border: "1px solid rgba(16,185,129,0.3)",
    color: "#10b981",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 20,
  },
  billCard: {
    background: "#081127",
    borderRadius: 16,
    padding: 24,
    border: "1px solid rgba(124,58,237,0.2)",
  },
  billHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 20,
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    marginBottom: 20,
  },
  billAmount: {
    fontSize: 28,
    fontWeight: 700,
    color: "#7c3aed",
  },
  billDetails: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  billDetailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
  },
  billLabel: {
    fontSize: 13,
    color: "#94a3b8",
  },
  billValue: {
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
    textAlign: "right",
  },
  payButton: {
    flex: 1,
    padding: "14px 20px",
    borderRadius: 10,
    border: "none",
    background: "#10b981",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 16,
  },
  securityNote: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    background: "rgba(59,130,246,0.05)",
    border: "1px solid rgba(59,130,246,0.1)",
    textAlign: "center",
  },
};
