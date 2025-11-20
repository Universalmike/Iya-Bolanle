// src/App.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp
} from "firebase/firestore";
import { getBalance, sendTransfer, buyAirtime } from "./flutterwave";

/* --------------------------- Config & Init --------------------------- */
// Gemini client
let genAI = null;
try {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (key) genAI = new GoogleGenerativeAI(key);
  else console.warn("VITE_GEMINI_API_KEY missing — running in simulated mode.");
} catch (e) {
  console.warn("Gemini init error:", e);
  genAI = null;
}

// Firebase init
let firestore = null;
try {
  const raw = import.meta.env.VITE_FIREBASE_CONFIG || "";
  const cfg = raw ? JSON.parse(raw) : null;
  if (cfg && cfg.apiKey) {
    const app = initializeApp(cfg);
    firestore = getFirestore(app);
  } else {
    console.warn("VITE_FIREBASE_CONFIG missing/invalid — Firestore disabled.");
  }
} catch (e) {
  console.warn("Firebase init error:", e);
  firestore = null;
}

// Gemini model helper
const getModel = (name = "models/gemini-2.5-flash") => {
  if (!genAI) return null;
  try { return genAI.getGenerativeModel({ model: name }); }
  catch (e) { console.warn("getGenerativeModel error:", e); return null; }
};

/* --------------------------- Utilities --------------------------- */
// Language mapping
const LANG_TO_LOCALE = { english: "en-NG", pidgin: "pcm-NG", yoruba: "yo-NG", igbo: "ig-NG", hausa: "ha-NG" };

// Detect language from keywords
const detectLanguage = (text = "") => {
  const s = (text || "").toLowerCase();
  if (/\b(abeg|wey|una|omo|make i|make we|i go|i go do)\b/.test(s)) return "pidgin";
  if (/[ṣọẹọ́àèìòùẹ]/.test(s) || /\b(mi |mi o|kin ni|se|owo|bawo|emi)\b/.test(s)) return "yoruba";
  if (/\b(biko|nna|nne|ego|kedu|onye)\b/.test(s) || /ị|ọ/.test(s)) return "igbo";
  if (/\b(kai|ina|yaya|sannu|don allah|wallahi)\b/.test(s)) return "hausa";
  return "english";
};

// Pick best voice for TTS
const pickVoiceForLocale = (locale) => {
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  const exact = voices.find(v => v.lang && v.lang.toLowerCase().includes(locale.toLowerCase()));
  if (exact) return exact;
  const pref = voices.find(v => v.lang && (v.lang.toLowerCase().includes("en-ng") || v.lang.toLowerCase().includes("en-gb")));
  if (pref) return pref;
  return voices.find(v => v.lang && v.lang.toLowerCase().includes("en-us")) || voices[0];
};

// Ensure voices loaded
const ensureVoicesLoaded = () => new Promise(res => {
  const v = window.speechSynthesis.getVoices();
  if (v && v.length) return res(true);
  window.speechSynthesis.onvoiceschanged = () => res(true);
  setTimeout(() => res(!!window.speechSynthesis.getVoices().length), 1200);
});

// Clean text for TTS
const cleanForSpeech = (text) => text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "").replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, "").trim();

// Speak text
const speakText = async (text, languageKey = "english") => {
  if (!("speechSynthesis" in window)) return;
  const clean = cleanForSpeech(text);
  if (!clean) return;
  await ensureVoicesLoaded();
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    const locale = LANG_TO_LOCALE[languageKey] || "en-NG";
    const voice = pickVoiceForLocale(locale);
    if (voice) utter.voice = voice;
    switch (languageKey) {
      case "yoruba": utter.rate = 0.95; utter.pitch = 1.1; break;
      case "hausa": utter.rate = 0.95; utter.pitch = 0.95; break;
      case "igbo": utter.rate = 1.0; utter.pitch = 1.05; break;
      case "pidgin": utter.rate = 0.98; utter.pitch = 1.0; break;
      default: utter.rate = 1.0; utter.pitch = 1.0;
    }
    window.speechSynthesis.speak(utter);
  } catch (e) { console.warn("TTS failed:", e); }
};

/* --------------------------- Firestore helpers --------------------------- */
const USERS_COLLECTION = "owo_users";
const userDocRef = (username) => firestore ? doc(firestore, USERS_COLLECTION, username) : null;

const createUserIfMissing = async (username) => {
  if (!firestore) return { balance: 10000, transactions: [] };
  const ref = userDocRef(username);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const initial = { balance: 10000, transactions: [], createdAt: serverTimestamp() };
      await setDoc(ref, initial);
      return initial;
    }
    return snap.data();
  } catch (e) { console.warn("Firestore createUserIfMissing error:", e); return null; }
};

const saveTransaction = async (username, tx, newBalance) => {
  if (!firestore) return false;
  const ref = userDocRef(username);
  try {
    const updatePayload = { transactions: arrayUnion(tx) };
    if (typeof newBalance === "number") updatePayload.balance = newBalance;
    await updateDoc(ref, updatePayload);
    return true;
  } catch (e) {
    console.warn("Firestore saveTransaction error:", e);
    return false;
  }
};

const fetchUserData = async (username) => {
  if (!firestore) return null;
  try {
    const snap = await getDoc(userDocRef(username));
    return snap.exists() ? snap.data() : null;
  } catch (e) { console.warn("Firestore fetchUserData error:", e); return null; }
};

/* --------------------------- Intent parser --------------------------- */
const parseIntent = (text) => {
  const s = (text || "").toLowerCase();
  const num = s.match(/\b(\d{2,}|[0-9]+)\b/);
  const amount = num ? parseInt(num[0].replace(/[^\d]/g, ""), 10) : null;

  if (/\b(send|transfer|pay|give)\b/.test(s)) {
    const toMatch = s.match(/\b(?:to|for)\s+([A-Za-z0-9_]+)/);
    return { intent: "transfer", amount, recipient: toMatch ? toMatch[1] : null };
  }
  if (/\b(airtime|recharge|top ?up)\b/.test(s)) return { intent: "buy_airtime", amount, recipient: null };
  if (/\b(balance|remain|how much|wetin be my balance|kin ni balance)\b/.test(s)) return { intent: "check_balance" };
  if (/\b(history|transactions|show transactions)\b/.test(s)) return { intent: "show_transaction_history" };
  return { intent: null };
};

/* --------------------------- App Component --------------------------- */
export default function App() {
  const [username, setUsername] = useState("");
  const [loggedInAs, setLoggedInAs] = useState(null);
  const [userState, setUserState] = useState({ balance: 0, transactions: [] });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef(null);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, loading]);
  useEffect(() => { ensureVoicesLoaded(); }, []);

  // Login handler
  const handleLogin = async () => {
    const name = (username || "").trim().toLowerCase();
    if (!name) return alert("Enter a username");
    setLoading(true);
    const data = await createUserIfMissing(name);
    if (data) {
      setLoggedInAs(name);
      setUserState({ balance: data.balance || 0, transactions: data.transactions || [] });
      const welcome = `Welcome ${name}. How can I help you today?`;
      setMessages([{ role: "assistant", text: welcome, lang: "english" }]);
      speakText(welcome, "english");
    }
    setLoading(false);
  };

  /* --------------------------- Voice input --------------------------- */
  const startListening = useCallback(() => {
    if (!("SpeechRecognition" in window) && !("webkitSpeechRecognition" in window)) {
      setMessages(prev => [...prev, { role: "assistant", text: "Voice input not supported.", lang: "english" }]);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = "en-NG"; // Use English/Nigerian accent; could be dynamic per lang
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onresult = (evt) => {
      const text = evt.results[0][0].transcript;
      setListening(false); rec.stop(); setInput(text); handleSend(text);
    };
    rec.onerror = () => { setListening(false); rec.stop(); };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
  }, [messages, loggedInAs, userState]);

  const stopListening = () => { try { recognitionRef.current?.stop(); } catch {} setListening(false); };

  /* --------------------------- Core send --------------------------- */
  const handleSend = async (explicitText) => {
    const text = ((explicitText ?? input) || "").trim();
    if (!text || !loggedInAs) return;
    const langKey = detectLanguage(text);
    setMessages(prev => [...prev, { role: "user", text, lang: langKey }]);
    setInput(""); setLoading(true);

    // Gemini AI
    const systemPrompt = `
You are Owo, a kind multilingual financial assistant for Nigerian users.
Reply in SAME language. Never output JSON or code blocks.
Check balance, transfer, buy airtime, show history.
`;

    const shortHistory = messages.slice(-8).map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`);
    const model = getModel("models/gemini-2.5-flash");
    let modelReply = null;

    if (model) {
      try {
        const response = await model.generateContent({
          contents: [
            { parts: [{ text: systemPrompt }] },
            { parts: [{ text: shortHistory.join("\n") }] },
            { parts: [{ text }] }
          ],
          model: "models/gemini-2.5-flash"
        });
        modelReply = response?.candidates?.[0]?.content?.parts?.[0]?.text || "Okay, working on it...";
      } catch { modelReply = "Okay, working on it..."; }
    } else { modelReply = "Alright — I'm working on that."; }

    // Intent parsing
    const parsed = parseIntent(text);
    let finalReply = modelReply;

    if (parsed.intent) {
      let currentBal = await getBalance(loggedInAs) ?? userState.balance ?? 10000;

      if (parsed.intent === "check_balance") finalReply = `Your balance is ₦${currentBal}.`;
      else if (parsed.intent === "transfer") {
        const amt = parsed.amount || 0;
        if (!amt) finalReply = "Please specify a valid amount to transfer.";
        else {
          const result = await sendTransfer(parsed.recipient, "044", amt); // Example bank code
          finalReply = result?.status === "success" ? `Transfer of ₦${amt} successful.` : `Transfer failed: ${result?.message || "Error"}`;
        }
      }
      else if (parsed.intent === "buy_airtime") {
        const amt = parsed.amount || 0;
        const result = await buyAirtime("08012345678", amt); // Example phone
        finalReply = result?.status === "success" ? `Airtime purchase of ₦${amt} successful.` : `Airtime failed: ${result?.message || "Error"}`;
      }
      else if (parsed.intent === "show_transaction_history") {
        const latestData = await fetchUserData(loggedInAs) || userState;
        const txs = latestData.transactions || [];
        finalReply = txs.length ? txs.slice(-8).reverse().map(t => `${t.date} — ${t.type} — ₦${t.amount}`).join("\n") : "No transactions yet.";
      }
    }

    setMessages(prev => [...prev, { role: "assistant", text: finalReply, lang: langKey }]);
    await speakText(finalReply, langKey);
    setLoading(false);
  };

  /* --------------------------- UI --------------------------- */
  if (!loggedInAs) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 20 }}>
      <h2>Owo — Financial Assistant</h2>
      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
      <button onClick={handleLogin}>{loading ? "Loading..." : "Login"}</button>
    </div>
  );

  return (
    <div style={{ padding: 20 }}>
      <h3>Owo</h3>
      <div>Logged in as {loggedInAs} • ₦{userState.balance}</div>
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {messages.map((m, i) => <div key={i} style={{ textAlign: m.role === "user" ? "right" : "left" }}>{m.text}</div>)}
        <div ref={bottomRef}></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button onClick={() => (listening ? stopListening() : startListening())}>{listening ? "Listening..." : "Speak"}</button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder="Type here..." />
        <button onClick={() => handleSend()}>Send</button>
      </div>
    </div>
  );
}
