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

/* ------------------ Config & Initialization ------------------ */

// Gemini init (safe)
let genAI = null;
try {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (key) {
    genAI = new GoogleGenerativeAI(key);
  } else {
    console.warn("VITE_GEMINI_API_KEY missing — running with simulated replies.");
  }
} catch (e) {
  console.warn("Failed to init Gemini client — running simulated replies.", e);
}

// Firebase init (safe parse)
let firebaseApp = null;
let firestore = null;
try {
  const raw = import.meta.env.VITE_FIREBASE_CONFIG || "";
  const cfg = raw ? JSON.parse(raw) : null;
  if (cfg && cfg.apiKey) {
    firebaseApp = initializeApp(cfg);
    firestore = getFirestore(firebaseApp);
  } else {
    console.warn("VITE_FIREBASE_CONFIG missing or invalid — Firebase disabled.");
  }
} catch (e) {
  console.warn("Firebase init failed:", e);
  firestore = null;
}

// helper to get model
const getModel = (modelName = "models/gemini-2.5-flash") => {
  if (!genAI) return null;
  try {
    return genAI.getGenerativeModel({ model: modelName });
  } catch (e) {
    console.warn("getGenerativeModel failed:", e);
    return null;
  }
};

/* ------------------ Utilities ------------------ */

// simple language detector
const detectLanguage = (text = "") => {
  const s = (text || "").toLowerCase();
  if (/\b(abeg|wey|una|omo|i go|make I|make we)\b/.test(s)) return "pidgin";
  if (/[ṣọạẹọẹ́àèìòù]/.test(s) || /\b(mi |mi o|kin ni|se|owo|bawo)\b/.test(s)) return "yoruba";
  if (/\b(biko|nna|nne|ego|kedu|onye)\b/.test(s) || /ị|ọ/.test(s)) return "igbo";
  if (/\b(kai|ina|yaya|sannu|don Allah|wallahi)\b/.test(s)) return "hausa";
  return "english";
};

// pick a TTS voice
const pickVoiceForLanguage = (lang) => {
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  const find = (p) => voices.find(v => v.lang && v.lang.toLowerCase().includes(p));
  if (["pidgin", "yoruba", "igbo", "hausa"].includes(lang)) {
    return find("en-ng") || find("en-gb") || voices[0];
  }
  return find("en-us") || find("en-gb") || voices[0];
};

const ensureVoicesLoaded = () => {
  return new Promise((resolve) => {
    const vs = window.speechSynthesis.getVoices();
    if (vs && vs.length) return resolve(true);
    window.speechSynthesis.onvoiceschanged = () => resolve(true);
    setTimeout(() => resolve(!!window.speechSynthesis.getVoices().length), 1200);
  });
};

const speakText = async (text, lang = "english") => {
  if (!("speechSynthesis" in window)) return;
  await ensureVoicesLoaded();
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voice = pickVoiceForLanguage(lang);
    if (voice) utter.voice = voice;
    // small tuning per language for better cadence
    if (lang === "yoruba") { utter.rate = 0.95; utter.pitch = 1.05; }
    else if (lang === "hausa") { utter.rate = 0.95; utter.pitch = 0.95; }
    else if (lang === "igbo") { utter.rate = 1.0; utter.pitch = 1.05; }
    else if (lang === "pidgin") { utter.rate = 0.98; utter.pitch = 1.0; }
    else { utter.rate = 1.0; utter.pitch = 1.0; }
    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.warn("TTS error:", e);
  }
};

/* ------------------ Firestore helpers ------------------ */

const USERS_COLLECTION = "owo_users";

// fetch user doc by username (simple path: users/{username})
const getUserDocRef = (username) => {
  if (!firestore) return null;
  return doc(firestore, USERS_COLLECTION, username);
};

const ensureUserInFirestore = async (username) => {
  if (!firestore) return null;
  const userRef = getUserDocRef(username);
  try {
    const snapshot = await getDoc(userRef);
    if (!snapshot.exists()) {
      // create initial user doc
      await setDoc(userRef, {
        balance: 10000,
        transactions: [],
        createdAt: serverTimestamp()
      });
      return { balance: 10000, transactions: [] };
    }
    return snapshot.data();
  } catch (e) {
    console.warn("Firestore ensure user error:", e);
    return null;
  }
};

const appendTransactionToFirestore = async (username, tx) => {
  if (!firestore) return false;
  const userRef = getUserDocRef(username);
  try {
    await updateDoc(userRef, {
      transactions: arrayUnion(tx),
      balance: typeof tx.newBalance === "number" ? tx.newBalance : undefined
    });
    return true;
  } catch (e) {
    // Fallback: read-modify-write if arrayUnion/newBalance failed
    try {
      const snapshot = await getDoc(userRef);
      if (!snapshot.exists()) return false;
      const data = snapshot.data();
      const newTxs = [...(data.transactions || []), tx];
      await setDoc(userRef, { ...data, transactions: newTxs, balance: tx.newBalance }, { merge: true });
      return true;
    } catch (err) {
      console.warn("Firestore append fallback failed:", err);
      return false;
    }
  }
};

const getLatestUserData = async (username) => {
  if (!firestore) return null;
  const userRef = getUserDocRef(username);
  try {
    const snapshot = await getDoc(userRef);
    return snapshot.exists() ? snapshot.data() : null;
  } catch (e) {
    console.warn("Firestore get user error:", e);
    return null;
  }
};

/* ------------------ Intent parsing (heuristic) ------------------ */
const parseIntentFromText = (text) => {
  const s = (text || "").toLowerCase();
  const numMatch = s.match(/\b(\d{2,}|[0-9]+)\b/);
  const amount = numMatch ? parseInt(numMatch[0], 10) : null;

  if (/\b(send|transfer|pay|give|transfer to|send to|transfer ₦|send ₦)\b/.test(s)) {
    const toMatch = s.match(/\b(?:to|give|for)\s+([A-Za-z0-9_]+)/);
    const recipient = toMatch ? toMatch[1] : null;
    return { intent: "transfer", amount, recipient };
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

/* ------------------ React App ------------------ */
export default function App() {
  // user and auth
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // chat
  const [messages, setMessages] = useState([]); // { role, text, lang }
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  // speech recognition
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);

  // current user data cache
  const [userData, setUserData] = useState({ balance: 0, transactions: [] });

  // autoscroll ref
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    // Ensure voices loaded
    ensureVoicesLoaded();
  }, []);

  // login handler: create or fetch user from Firestore
  const handleLogin = async () => {
    const name = username.trim().toLowerCase();
    if (!name) return alert("Please enter a username");
    setThinking(true);
    const data = await ensureUserInFirestore(name);
    if (data) {
      setUserData({ balance: data.balance || 0, transactions: data.transactions || [] });
      setMessages([{ role: "assistant", text: `👋 Welcome ${name}! How can I help you today?`, lang: "english" }]);
      speakText(`Welcome ${name}. How can I help you today?`, "english");
      setIsLoggedIn(true);
    } else {
      alert("Could not reach database. You can still use simulated mode.");
      setMessages([{ role: "assistant", text: `👋 Welcome ${name}! Running locally (simulated).`, lang: "english" }]);
      setIsLoggedIn(true);
    }
    setThinking(false);
  };

  /* ------------------ Voice input (SpeechRecognition) ------------------ */
  const startListening = useCallback(() => {
    if (!("SpeechRecognition" in window) && !("webkitSpeechRecognition" in window)) {
      setMessages(prev => [...prev, { role: "assistant", text: "Voice input is not supported in this browser.", lang: "english" }]);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-NG";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onresult = (ev) => {
      const transcript = ev.results[0][0].transcript;
      setListening(false);
      recognition.stop();
      setInput(transcript);
      // automatically send
      handleSend(transcript);
    };
    recognition.onerror = (e) => {
      console.warn("Speech recognition error:", e);
      setListening(false);
      setMessages(prev => [...prev, { role: "assistant", text: "Voice input failed. Try typing.", lang: "english" }]);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  }, [messages, username, userData]);

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch (e) {}
    setListening(false);
  };

  /* ------------------ Core send: ask Gemini, run action, store ------------------ */
  const handleSend = async (explicitText) => {
    const text = (explicitText !== undefined ? explicitText : input || "").trim();
    if (!text) return;
    if (!isLoggedIn) {
      setMessages(prev => [...prev, { role: "assistant", text: "Please login with your username first.", lang: "english" }]);
      return;
    }

    const lang = detectLanguage(text);
    setMessages(prev => [...prev, { role: "user", text, lang }]);
    setInput("");
    setThinking(true);

    // compose system prompt to force same-language replies and no JSON showing
    const systemPrompt = `
You are Owo, a helpful multilingual financial assistant for Nigerian users.
Always reply in the SAME language as the user's message (English, Pidgin, Yoruba, Hausa, Igbo).
Do NOT output raw JSON or code blocks. Reply naturally and ask short clarifying questions when necessary.
You can check balance, make transfers, buy airtime, and show transaction history.
`;

    // get short history
    const shortHistory = messages.slice(-8).map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`);
    const model = getModel("models/gemini-2.5-flash");

    let botReply = null;

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
        botReply = response?.candidates?.[0]?.content?.parts?.[0]?.text ||
                   (response?.response?.text ? response.response.text() : null);
      } catch (gErr) {
        console.warn("Gemini request failed:", gErr);
      }
    }

    // fallback friendly reply if no model reply
    if (!botReply) {
      botReply = lang === "pidgin" ? "Okay, make I handle that..." : "Alright — I'm on it...";
    }

    // parse intent from user's text (heuristic)
    const parsed = parseIntentFromText(text);
    let finalReply = botReply;

    // perform action & persist to Firestore
    const userKey = username.trim().toLowerCase();
    if (parsed.intent) {
      // fetch latest user state
      const latest = await getLatestUserData(userKey);
      const currentBalance = latest?.balance ?? userData.balance ?? 0;
      if (parsed.intent === "check_balance") {
        finalReply = `💰 Your balance is ₦${currentBalance}.`;
      } else if (parsed.intent === "transfer") {
        const amt = parsed.amount || 0;
        const recipient = parsed.recipient || "recipient";
        if (amt <= 0) {
          finalReply = lang === "pidgin" ? "Which amount you wan send?" : "Please tell me the amount to transfer.";
        } else if (currentBalance < amt) {
          finalReply = "Transaction failed: insufficient funds.";
        } else {
          const newBal = currentBalance - amt;
          const tx = { type: "Transfer", amount: amt, to: recipient, date: new Date().toISOString(), newBalance: newBal };
          const ok = await appendTransactionToFirestore(userKey, tx);
          if (ok) {
            finalReply = `✅ Transfer of ₦${amt} to ${recipient} completed. New balance: ₦${newBal}.`;
            setUserData(prev => ({ ...prev, balance: newBal, transactions: [...(prev.transactions||[]), tx] }));
          } else {
            finalReply = "Transfer completed locally, but failed to save to database.";
          }
        }
      } else if (parsed.intent === "buy_airtime") {
        const amt = parsed.amount || 0;
        if (amt <= 0) {
          finalReply = lang === "pidgin" ? "Which amount of airtime you want?" : "Please specify the airtime amount.";
        } else if (currentBalance < amt) {
          finalReply = "Transaction failed: insufficient funds.";
        } else {
          const newBal = currentBalance - amt;
          const tx = { type: "Airtime", amount: amt, to: "Self", date: new Date().toISOString(), newBalance: newBal };
          const ok = await appendTransactionToFirestore(userKey, tx);
          if (ok) {
            finalReply = `📱 Airtime purchase of ₦${amt} successful. New balance: ₦${newBal}.`;
            setUserData(prev => ({ ...prev, balance: newBal, transactions: [...(prev.transactions||[]), tx] }));
          } else {
            finalReply = "Airtime processed locally, saving to database failed.";
          }
        }
      } else if (parsed.intent === "show_transaction_history") {
        const latestData = latest || userData;
        const txs = latestData.transactions || [];
        if (!txs.length) finalReply = "You have no transactions yet.";
        else {
          const list = txs.slice(-8).reverse().map(t => `${new Date(t.date).toLocaleString()} — ${t.type} — ₦${t.amount}${t.to ? ` — to ${t.to}` : ""}`).join("\n");
          finalReply = `📜 Recent transactions:\n${list}`;
        }
      }
    }

    // add assistant message
    setMessages(prev => [...prev, { role: "assistant", text: finalReply, lang }]);

    // speak reply
    await speakText(finalReply, lang);

    setThinking(false);
  };

  /* ------------------ Render UI ------------------ */
  if (!isLoggedIn) {
    return (
      <div style={styles.outer}>
        <div style={styles.card}>
          <h2 style={{ margin: 0 }}>💸 Owo — Financial Assistant</h2>
          <p style={{ color: "#cfcfcf" }}>Enter a username to continue (data stored in Firebase).</p>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username (e.g. michael)"
            style={styles.input}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleLogin} style={styles.primary}>Continue</button>
            <button onClick={() => { setUsername("guest"); handleLogin(); }} style={styles.secondary}>Use guest</button>
          </div>
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 10 }}>
            Make sure your Firebase config is set in VITE_FIREBASE_CONFIG for persistent storage.
          </p>
        </div>
      </div>
    );
  }

  // logged in view
  return (
    <div style={styles.outer}>
      <div style={styles.cardLarge}>
        <div style={styles.header}>
          <div>
            <h3 style={{ margin: 0 }}>💬 Owo</h3>
            <div style={{ fontSize: 12, color: "#cfcfcf" }}>Logged in as <b>{username}</b> • ₦{userData.balance || "0"}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={styles.tag} onClick={() => {
              // refresh user data
              (async () => {
                const latest = await getLatestUserData(username.trim().toLowerCase());
                if (latest) setUserData({ balance: latest.balance || 0, transactions: latest.transactions || [] });
              })();
            }}>Refresh</button>
            <button style={styles.tag} onClick={() => {
              // logout
              setIsLoggedIn(false);
              setUsername("");
              setMessages([]);
            }}>Logout</button>
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

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type or press Speak..."
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", background: "#071024", color: "#fff" }}
          />

          <button onClick={() => handleSend()} style={styles.primary}>
            Send
          </button>
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

/* ------------------ Styles ------------------ */
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

