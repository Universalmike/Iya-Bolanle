import React, { useEffect, useState, useRef, useCallback } from "react";
import { api, loadSession, saveSession, clearSession, UNAUTHORIZED_EVENT } from "./api";
import { SPEECH_CODES, ui, loadLanguageChoice, saveLanguageChoice } from "./i18n";
import { loadTheme, saveTheme, applyTheme } from "./theme";
import { TabBar } from "./components";
import LoginScreen from "./LoginScreen";
import ChatScreen from "./ChatScreen";
import EsusuView from "./EsusuView";
import BillsScreen from "./BillsScreen";
import MeScreen from "./MeScreen";

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

// The first chat bubbles after login: the welcome, plus any "bola sent you ₦500" notice.
const welcomeMessages = (data) => [
  { role: "assistant", text: data.welcomeMessage },
  ...(data.notice ? [{ role: "notice", text: data.notice }] : []),
];

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
  const [tab, setTab] = useState("chat"); // chat | esusu | bills | me
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  // True while SARA is waiting for "yes"/"no" on a transfer or airtime purchase
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  // The language SARA replies in and the screen is shown in. Before login it follows
  // the choice on the login screen ("auto" shows English until the account is known).
  const [language, setLanguage] = useState(() => {
    const choice = loadLanguageChoice();
    return choice !== "auto" ? choice : "english";
  });
  // The saved preference ("auto" or a language), and an offer to switch when the user writes in another one.
  const [languagePref, setLanguagePref] = useState(() => loadLanguageChoice());
  const [languageSuggestion, setLanguageSuggestion] = useState(null);
  const [theme, setTheme] = useState(loadTheme); // system | light | dark
  const [balance, setBalance] = useState(null);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  // Message on the login screen (signup result, login error, session expired): { ok, text }.
  const [loginNotice, setLoginNotice] = useState(null);
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const chatEndRef = useRef(null);
  const [esusuGroups, setEsusuGroups] = useState([]);
  const [scannedBill, setScannedBill] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isPayingBill, setIsPayingBill] = useState(false);
  const [billAmount, setBillAmount] = useState("");
  const [billNotice, setBillNotice] = useState(null); // { kind: success|error|gold, text }
  const fileInputRef = useRef(null);

  // Keep the newest message in view (also when coming back to the Chat tab).
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tab, isThinking]);

  // ------------------------- Theme -------------------------
  const changeTheme = (value) => {
    setTheme(value);
    saveTheme(value);
  };
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system" || !window.matchMedia) return;
    // Following the phone: update the browser bar colour when the phone switches.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, [theme]);

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
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
      .replace(/[\u{2600}-\u{26FF}]/gu, "")
      .replace(/[\u{2700}-\u{27BF}]/gu, "")
      .replace(/₦/g, "Naira ")
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
  // A "notice" (e.g. "bola sent you ₦500") is shown as its own banner before the reply.
  const showReply = (data, fallbackText) => {
    const text = data?.message || fallbackText;
    setMessages((prev) => [
      ...prev,
      ...(data?.notice ? [{ role: "notice", text: data.notice }] : []),
      { role: "assistant", text },
    ]);
    if (typeof data?.balance === "number") setBalance(data.balance);
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
      if (value !== "auto") setLanguage(value);
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
      setLoginNotice({ ok: true, text: res.data.message });
    } catch (err) {
      setLoginNotice({ ok: false, text: err.response?.data?.message || ui("genericError", language) });
    }
  };

  const handleLogin = async () => {
    try {
      const res = await api.post(`/login`, { username, password, language: loginLanguage() });
      saveSession({ token: res.data.token, username: res.data.username });
      setUsername(res.data.username);
      setPassword("");
      setIsLoggedIn(true);
      setTab("chat");
      setBalance(res.data.balance);
      applyLanguage(res.data);
      setMessages(welcomeMessages(res.data));
      setLoginNotice(null);
      speakText([res.data.welcomeMessage, res.data.notice].filter(Boolean).join(" "), res.data.language);
    } catch (err) {
      setLoginNotice({ ok: false, text: err.response?.data?.message || ui("genericError", language) });
    }
  };

  const logout = useCallback(() => {
    clearSession();
    window.speechSynthesis?.cancel();
    setIsLoggedIn(false);
    setTab("chat");
    setBalance(null);
    setMessages([]);
    setAwaitingConfirm(false);
    setLanguageSuggestion(null);
    setUsername("");
    setPassword("");
    setEsusuGroups([]);
    setScannedBill(null);
    setBillNotice(null);
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
        setBalance(res.data.balance);
        applyLanguage(res.data);
        setMessages(welcomeMessages(res.data));
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
      setLoginNotice({ ok: false, text: ui("sessionExpired", languageRef.current) });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [logout]);

  // ------------------------- Balance -------------------------
  // Replies carry the balance after each action; this also catches money that
  // arrived from someone else while the tab was in the background.
  const refreshBalance = async () => {
    setRefreshingBalance(true);
    try {
      const res = await api.get("/balance");
      setBalance(res.data.balance);
    } catch {
      // keep showing the last known balance
    } finally {
      setRefreshingBalance(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") refreshBalance();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [isLoggedIn]);

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
      await Promise.all([fetchEsusuGroups(), refreshBalance()]);
      return { ok: true, message: res.data.message };
    } catch (err) {
      const message = err.response?.data?.message || ui("genericError", language);
      showReply(err.response?.data, message);
      await fetchEsusuGroups();
      return { ok: false, message };
    }
  };

  useEffect(() => {
    if (isLoggedIn) fetchEsusuGroups();
  }, [isLoggedIn]);

  // Opening the Esusu tab shows fresh rounds and payments.
  useEffect(() => {
    if (isLoggedIn && tab === "esusu") fetchEsusuGroups();
  }, [tab, isLoggedIn]);

  // ------------------------- Bill Scanner Functions -------------------------
  // The server reads the photo with Gemini and stores the bill; we only send its id to pay.
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    event.target.value = ""; // lets the same photo be picked again after an error
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setBillNotice({ kind: "error", text: ui("notAnImage", language) });
      return;
    }

    setIsScanning(true);
    setScannedBill(null);
    setBillNotice(null);
    try {
      const imageData = await shrinkImage(file);
      const res = await api.post(`/scan-bill`, { imageData });
      const bill = res.data.billData;
      setScannedBill(bill);
      setBillAmount(bill.amount ? String(bill.amount) : "");
      // Overdue or possibly already paid: a warning, not a plain success.
      setBillNotice({ kind: res.data.possibleDuplicate || bill.overdue ? "gold" : "success", text: res.data.message });
      showReply(res.data);
    } catch (err) {
      const message = err.response?.data?.message || ui("scanFailed", language);
      setBillNotice({ kind: "error", text: message });
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
      setBillAmount("");
      setBillNotice({ kind: "success", text: res.data.message });
    } catch (err) {
      const message = err.response?.data?.message || ui("genericError", language);
      setBillNotice({ kind: "error", text: message });
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
    setAwaitingConfirm(false);
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

  // ------------------------- Render -------------------------
  if (isRestoring) {
    return (
      <main className="login" aria-busy="true">
        <div className="scanning" role="status">
          <div className="spinner" aria-hidden="true"></div>
          <p>{ui("loading", language)}</p>
        </div>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <LoginScreen
        lang={language}
        languagePref={languagePref}
        onChangeLanguage={changeLanguage}
        username={username}
        password={password}
        setUsername={setUsername}
        setPassword={setPassword}
        onLogin={handleLogin}
        onSignup={handleSignup}
        notice={loginNotice}
        onDismissNotice={() => setLoginNotice(null)}
      />
    );
  }

  return (
    <div className="app">
      {tab === "chat" && (
        <ChatScreen
          lang={language}
          username={username}
          balance={balance}
          onRefreshBalance={refreshBalance}
          refreshing={refreshingBalance}
          languagePref={languagePref}
          onChangeLanguage={changeLanguage}
          languageSuggestion={languageSuggestion}
          onAcceptSuggestion={changeLanguage}
          onDismissSuggestion={() => setLanguageSuggestion(null)}
          messages={messages}
          isThinking={isThinking}
          awaitingConfirm={awaitingConfirm}
          chatEndRef={chatEndRef}
          input={input}
          setInput={setInput}
          onSend={handleSend}
          onHistory={fetchHistory}
          isListening={isListening}
          onStartListening={startListening}
          onStopListening={stopListening}
        />
      )}
      {tab === "esusu" && <EsusuView groups={esusuGroups} onAction={esusuAction} lang={language} />}
      {tab === "bills" && (
        <BillsScreen
          lang={language}
          fileInputRef={fileInputRef}
          onImageUpload={handleImageUpload}
          isScanning={isScanning}
          scannedBill={scannedBill}
          notice={billNotice}
          onDismissNotice={() => setBillNotice(null)}
          amount={billAmount}
          onAmountChange={setBillAmount}
          onPay={handlePayBill}
          isPaying={isPayingBill}
        />
      )}
      {tab === "me" && (
        <MeScreen
          lang={language}
          username={username}
          languagePref={languagePref}
          onChangeLanguage={changeLanguage}
          theme={theme}
          onChangeTheme={changeTheme}
          onLogout={logout}
        />
      )}
      <TabBar tab={tab} onChange={setTab} lang={language} />
    </div>
  );
}
