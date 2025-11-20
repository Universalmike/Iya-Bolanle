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

/* --------------------------- Config & Init --------------------------- */
// Gemini client (safe)
let genAI = null;
try {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (key) genAI = new GoogleGenerativeAI(key);
  else console.warn("VITE_GEMINI_API_KEY missing — running in simulated mode.");
} catch (e) {
  console.warn("Gemini init error:", e);
  genAI = null;
}

// Firebase init (safe parse)
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

// helper to get model safely
const getModel = (name = "models/gemini-2.5-flash") => {
  if (!genAI) return null;
  try {
    return genAI.getGenerativeModel({ model: name });
  } catch (e) {
    console.warn("getGenerativeModel error:", e);
    return null;
  }
};

/* --------------------------- Utilities --------------------------- */

// Language -> locale mapping (Option 3)
const LANG_TO_LOCALE = {
  english: "en-NG",
  pidgin: "pcm-NG",
  yoruba: "yo-NG",
  igbo: "ig-NG",
  hausa: "ha-NG"
};

// Basic keyword-based language detector
const detectLanguage = (text = "") => {
  const s = (text || "").toLowerCase();
  if (/\b(abeg|wey|una|omo|make i|make we|i go|i go do)\b/.test(s)) return "pidgin";
  if (/[ṣọẹọ́àèìòùẹ]/.test(s) || /\b(mi |mi o|kin ni|se|owo|bawo|emi)\b/.test(s)) return "yoruba";
  if (/\b(biko|nna|nne|ego|kedu|onye)\b/.test(s) || /ị|ọ/.test(s)) return "igbo";
  if (/\b(kai|ina|yaya|sannu|don allah|wallahi)\b/.test(s)) return "hausa";
  return "english";
};

// pick best available voice for locale; fallback gracefully
const pickVoiceForLocale = (locale) => {
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;

  // try exact match (en-NG, yo-NG, etc.), then fallback to en-GB or en-US
  const exact = voices.find(v => v.lang && v.lang.toLowerCase().includes(locale.toLowerCase()));
  if (exact) return exact;

  // pref for Nigerian/UK voices
  const pref = voices.find(v => v.lang && (v.lang.toLowerCase().includes("en-ng") || v.lang.toLowerCase().includes("en-gb")));
  if (pref) return pref;

  // fallback to US or first voice
  return voices.find(v => v.lang && v.lang.toLowerCase().includes("en-us")) || voices[0];
};

// ensure voices loaded (some browsers need onvoiceschanged)
const ensureVoicesLoaded = () => {
  return new Promise(res => {
    const v = window.speechSynthesis.getVoices();
    if (v && v.length) return res(true);
    window.speechSynthesis.onvoiceschanged = () => res(true);
    setTimeout(() => res(!!window.speechSynthesis.getVoices().length), 1200);
  });
};

// cleans text for TTS (remove emojis & weird characters)
const cleanForSpeech = (text) => {
  if (!text) return "";
  // remove emoji & control characters; keep punctuation, letters, numbers
  return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
             .replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, "") // letters, numbers, punctuation, spaces
             .trim();
};

// TTS speak wrapper
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
    // small cadence tuning per locale for more natural feel
    switch (languageKey) {
      case "yoruba": utter.rate = 0.95; utter.pitch = 1.05; break;
      case "hausa":  utter.rate = 0.95; utter.pitch = 0.95; break;
      case "igbo":   utter.rate = 1.0;  utter.pitch = 1.05; break;
      case "pidgin": utter.rate = 0.98; utter.pitch = 1.0;  break;
      default:       utter.rate = 1.0;  utter.pitch = 1.0;
    }
    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.warn("TTS failed:", e);
  }
};

/* --------------------------- Firestore helpers --------------------------- */

const USERS_COLLECTION = "owo_users";

// doc ref helper
const userDocRef = (username) => {
  if (!firestore) return null;
  return doc(firestore, USERS_COLLECTION, username);
};

// ensure user exists (create if not)
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
  } catch (e) {
    console.warn("Firestore createUserIfMissing error:", e);
    return null;
  }
};

// append transaction and update balance
const saveTransaction = async (username, tx, newBalance) => {
  if (!firestore) return false;
  const ref = userDocRef(username);
  try {
    // prefer update with arrayUnion & balance update
    const updatePayload = { transactions: arrayUnion(tx) };
    if (typeof newBalance === "number") updatePayload.balance = newBalance;
    await updateDoc(ref, updatePayload);
    return true;
  } catch (e) {
    // fallback read-modify-write
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return false;
      const data = snap.data();
      const newTxs = [...(data.transactions || []), tx];
      await setDoc(ref, { ...data, transactions: newTxs, balance: newBalance }, { merge: true });
      return true;
    } catch (err) {
      console.warn("Firestore saveTransaction fallback error:", err);
      return false;
    }
  }
};

// get latest user data
const fetchUserData = async (username) => {
  if (!firestore) return null;
  try {
    const snap = await getDoc(userDocRef(username));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("Firestore fetchUserData error:", e);
    return null;
  }
};

/* --------------------------- Intent heuristics --------------------------- */
const parseIntent = (text) => {
  const s = (text || "").toLowerCase();
  const num = s.match(/\b(\d{2,}|[0-9]+)\b/);
  const amount = num ? parseInt(num[0].replace(/[^\d]/g, ""), 10) : null;

  if (/\b(send|transfer|pay|give|transfer to|send to|transfer ₦|send ₦)\b/.test(s)) {
    const toMatch = s.match(/\b(?:to|give|for)\s+([A-Za-z0-9_]+)/);
    return { intent: "transfer", amount, recipient: toMatch ? toMatch[1] : null };
  }
  if (/\b(airtime|recharge|top ?up)\b/.test(s)) {
    return { intent: "buy_airtime", amount, recipient: null };
  }
  if (/\b(balance|remain|how much|how many|wetin be my balance|kin ni balance)\b/.test(s)) {
    return { intent: "check_balance" };
  }
  if (/\b(history|transactions|last transactions|transaction history|show transactions)\b/.test(s)) {
    return { intent: "show_transaction_history" };
  }
  return { intent: null };
};

/* --------------------------- App Component --------------------------- */
export default function App() {
  // auth & user
  const [username, setUsername] = useState("");
  const [loggedInAs, setLoggedInAs] = useState(null); // username normalized
  const [userState, setUserState] = useState({ balance: 0, transactions: [] });

  // chat
  const [messages, setMessages] = useState([]); // {role, text, lang}
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // speech recognition
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);

  // scroll
  const bottomRef = useRef(null);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, loading]);

  // ensure TTS voices loaded
  useEffect(() => { ensureVoicesLoaded(); }, []);

  // Login: create or fetch Firestore user
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
    } else {
      // Firestore unavailable -> simulated mode with local initial state
      setLoggedInAs(name);
      setUserState({ balance: 10000, transactions: [] });
      const warn = `Welcome ${name}. Running in simulated mode.`;
      setMessages([{ role: "assistant", text: warn, lang: "english" }]);
      speakText(warn, "english");
    }
    setLoading(false);
  };

  /* --------------------------- SpeechRecognition (voice input) --------------------------- */
  const startListening = useCallback(() => {
    if (!("SpeechRecognition" in window) && !("webkitSpeechRecognition" in window)) {
      setMessages(prev => [...prev, { role: "assistant", text: "Voice input not supported in this browser.", lang: "english" }]);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = "en-NG";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => setListening(true);
    rec.onresult = (evt) => {
      const text = evt.results[0][0].transcript;
      setListening(false);
      rec.stop();
      setInput(text);
      handleSend(text);
    };
    rec.onerror = (e) => {
      console.warn("SpeechRecognition error", e);
      setListening(false);
      setMessages(prev => [...prev, { role: "assistant", text: "Voice input failed. Try typing.", lang: "english" }]);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
  }, [messages, loggedInAs, userState]);

  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch (e) {}
    setListening(false);
  };

  /* --------------------------- Core send handler --------------------------- */
  const handleSend = async (explicitText) => {
    const text = (explicitText !== undefined ? explicitText : input || "").trim();
    if (!text) return;
    if (!loggedInAs) {
      setMessages(prev => [...prev, { role: "assistant", text: "Please login with a username first.", lang: "english" }]);
      return;
    }

    const langKey = detectLanguage(text);
    setMessages(prev => [...prev, { role: "user", text, lang: langKey }]);
    setInput("");
    setLoading(true);

    // System prompt — force same-language replies and avoid showing JSON
    const systemPrompt = `
You are Owo, a kind multilingual financial assistant for Nigerian users.
Always reply in the SAME language as the user's message (English, Pidgin, Yoruba, Hausa, Igbo).
Never output raw JSON or code blocks to the user. Reply naturally and warmly.
You can check balance, make transfers, buy airtime, and show transaction history.
If you need clarification, ask one short question in the user's language.
`;

    // short history
    const shortHistory = messages.slice(-8).map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`);
    const model = getModel("models/gemini-2.5-flash");

    // Ask Gemini (if available)
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
        // read candidate robustly
        modelReply = response?.candidates?.[0]?.content?.parts?.[0]?.text || (response?.response?.text ? response.response.text() : null);
      } catch (err) {
        console.warn("Gemini call error:", err);
      }
    }

    // Fallback friendly reply if model unavailable
    if (!modelReply) {
      modelReply = langKey === "pidgin" ? "Okay, make I handle that..." : "Alright — I'm working on that for you.";
    }

    // Parse intent heuristically & execute action using Firestore
    const parsed = parseIntent(text);
    let finalReply = modelReply;

    if (parsed.intent) {
      // fetch latest data before committing
      const latest = await fetchUserData(loggedInAs) || userState;
      let currentBal = latest.balance ?? userState.balance ?? 0;

      if (parsed.intent === "check_balance") {
        finalReply = `Your balance is ₦${currentBal}.`;
      } else if (parsed.intent === "transfer") {
        const amt = parsed.amount || 0;
        const recipient = parsed.recipient || "recipient";
        if (!amt || amt <= 0) {
          finalReply = langKey === "pidgin" ? "Which amount you wan send?" : "Please specify a valid amount to transfer.";
        } else if (currentBal < amt) {
          finalReply = "Transaction failed: insufficient funds.";
        } else {
          const newBal = currentBal - amt;
          const tx = { type: "Transfer", amount: amt, to: recipient, date: new Date().toISOString() };
          const ok = await saveTransaction(loggedInAs, tx, newBal);
          if (ok) {
            finalReply = `Transfer of ₦${amt} to ${recipient} completed. New balance: ₦${newBal}.`;
            setUserState(prev => ({ ...prev, balance: newBal, transactions: [...(prev.transactions || []), tx] }));
          } else {
            // local fallback
            setUserState(prev => ({ ...prev, balance: currentBal - amt, transactions: [...(prev.transactions || []), { type: "Transfer", amount: amt, to: recipient, date: new Date().toISOString() }] }));
            finalReply = `Transfer of ₦${amt} to ${recipient} completed (saved locally). New balance: ₦${currentBal - amt}.`;
          }
        }
      } else if (parsed.intent === "buy_airtime") {
        const amt = parsed.amount || 0;
        if (!amt || amt <= 0) {
          finalReply = langKey === "pidgin" ? "Which amount of airtime you want?" : "Please specify the airtime amount.";
        } else if (currentBal < amt) {
          finalReply = "Transaction failed: insufficient funds.";
        } else {
          const newBal = currentBal - amt;
          const tx = { type: "Airtime", amount: amt, to: "Self", date: new Date().toISOString() };
          const ok = await saveTransaction(loggedInAs, tx, newBal);
          if (ok) {
            finalReply = `Airtime purchase of ₦${amt} successful. New balance: ₦${newBal}.`;
            setUserState(prev => ({ ...prev, balance: newBal, transactions: [...(prev.transactions || []), tx] }));
          } else {
            setUserState(prev => ({ ...prev, balance: currentBal - amt, transactions: [...(prev.transactions || []), { type: "Airtime", amount: amt, to: "Self", date: new Date().toISOString() }] }));
            finalReply = `Airtime processed locally. New balance: ₦${currentBal - amt}.`;
          }
        }
      } else if (parsed.intent === "show_transaction_history") {
        const latestData = latest || userState;
        const txs = latestData.transactions || [];
        if (!txs.length) finalReply = "You have no transactions yet.";
        else {
          const lines = txs.slice(-8).reverse().map(t => `${new Date(t.date).toLocaleString()} — ${t.type} — ₦${t.amount}${t.to ? ` — to ${t.to}` : ""}`).join("\n");
          finalReply = `Recent transactions:\n${lines}`;
        }
      }
    }

    // push assistant reply (no JSON)
    setMessages(prev => [...prev, { role: "assistant", text: finalReply, lang: langKey }]);

    // speak reply in detected locale (cleaned)
    await speakText(finalReply, langKey);

    setLoading(false);
  };

  /* --------------------------- UI --------------------------- */

  if (!loggedInAs) {
    return (
      <div style={styles.outer}>
        <div style={styles.card}>
          <h2 style={{ margin: 0 }}>Owo — Financial Assistant</h2>
          <p style={{ color: "#cfcfcf" }}>Sign in with a username. Data stored in Firestore (if configured).</p>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username (e.g. michael)" style={styles.input} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleLogin} style={styles.primary} disabled={loading}>{loading ? "Starting..." : "Continue"}</button>
            <button onClick={() => { setUsername("guest"); handleLogin(); }} style={styles.secondary}>Use guest</button>
          </div>
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 10 }}>
            Tip: Ensure VITE_FIREBASE_CONFIG is set and Firestore rules allow reads/writes for this app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.outer}>
      <div style={styles.cardLarge}>
        <div style={styles.header}>
          <div>
            <h3 style={{ margin: 0 }}>Owo</h3>
            <div style={{ fontSize: 12, color: "#cfcfcf" }}>Logged in as <b>{loggedInAs}</b> • ₦{userState.balance || 0}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={styles.tag} onClick={async () => {
              const fresh = await fetchUserData(loggedInAs);
              if (fresh) setUserState({ balance: fresh.balance || 0, transactions: fresh.transactions || [] });
            }}>Refresh</button>
            <button style={styles.tag} onClick={() => { setMessages([]); }}>Clear chat</button>
          </div>
        </div>

        <div style={styles.chatWindow}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
              <div style={{ maxWidth: "78%", padding: 12, borderRadius: 8, background: m.role === "user" ? "#6b21a8" : "#111827", color: "#fff", whiteSpace: "pre-wrap" }}>
                {m.text}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <button onClick={() => (listening ? stopListening() : startListening())} style={{ padding: "10px 12px", borderRadius: 8, background: listening ? "#ef4444" : "#0f172a", color: "#fff", border: "none", cursor: "pointer" }}>
            {listening ? "● Listening" : "🎤 Speak"}
          </button>

          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="Type or press Speak..." style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", background: "#071024", color: "#fff" }} />

          <button onClick={() => handleSend()} style={styles.primary}>Send</button>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button style={styles.smallTag} onClick={() => { setInput("Check my balance"); setTimeout(() => handleSend(), 75); }}>Check my balance</button>
          <button style={styles.smallTag} onClick={() => { setInput("Abeg send 2000 to Tunde"); setTimeout(() => handleSend(), 75); }}>Abeg send 2000 to Tunde</button>
          <button style={styles.smallTag} onClick={() => { setInput("Help me buy 100 airtime"); setTimeout(() => handleSend(), 75); }}>Buy airtime 100</button>
          <button style={styles.smallTag} onClick={() => { setInput("Show my transaction history"); setTimeout(() => handleSend(), 75); }}>Show history</button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Styles --------------------------- */
const styles = {
  outer: {
    minHeight: "100vh",
    background: "linear-gradient(180deg,#020617 0%, #071024 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    fontFamily: "Inter, system-ui, sans-serif",
    color: "#fff",
  },
  card: {
    width: 420,
    padding: 20,
    borderRadius: 12,
    background: "#071027",
    boxShadow: "0 10px 30px rgba(2,6,23,0.8)",
    textAlign: "center",
  },
  input: {
    width: "100%",
    padding: 10,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "#061322",
    color: "#fff",
  },
  primary: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#7c3aed",
    color: "#fff",
    cursor: "pointer",
  },
  secondary: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "transparent",
    color: "#fff",
    cursor: "pointer",
  },
  cardLarge: {
    width: 880,
    maxWidth: "95%",
    padding: 18,
    borderRadius: 12,
    background: "#071027",
    boxShadow: "0 10px 30px rgba(2,6,23,0.8)",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  chatWindow: {
    height: "55vh",
    overflowY: "auto",
    padding: 12,
    borderRadius: 8,
    background: "#040617",
    border: "1px solid rgba(255,255,255,0.02)",
  },
  tag: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.03)",
    background: "#0b1220",
    color: "#cfcfcf",
    cursor: "pointer",
  },
  smallTag: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.03)",
    background: "#071022",
    color: "#cfcfcf",
    cursor: "pointer",
    fontSize: 13,
  }
};


