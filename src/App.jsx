import React, { useState, useEffect } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [balance, setBalance] = useState(10000); // initial balance ₦10,000
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    if (window.speechSynthesis) {
      const utter = new SpeechSynthesisUtterance(
        "Owo online! Wetin I fit do for you?"
      );
      window.speechSynthesis.speak(utter);
    }
  }, []);

  // Basic language detector
  const detectLanguage = (text) => {
    const lower = text.toLowerCase();
    if (/[áéíóúàèìòùẹọ]/.test(lower) || lower.includes("mi o") || lower.includes("se")) return "yoruba";
    if (lower.includes("abeg") || lower.includes("wey") || lower.includes("una")) return "pidgin";
    if (lower.includes("kai") || lower.includes("wallahi") || lower.includes("gani")) return "hausa";
    if (lower.includes("biko") || lower.includes("una eme")) return "igbo";
    return "english";
  };

  const simulateTransaction = (intent, amount, recipient) => {
    if (intent === "transfer") {
      if (amount > balance) return "You no get enough money for that transfer 😅";
      setBalance((prev) => prev - amount);
      setTransactions((prev) => [
        ...prev,
        { type: "Transfer", amount, to: recipient, date: new Date().toLocaleString() },
      ]);
      return `✅ Transfer of ₦${amount} to ${recipient} don go successfully. Your new balance na ₦${balance - amount}.`;
    }

    if (intent === "buy_airtime") {
      if (amount > balance) return "Your balance no reach for that airtime 😅";
      setBalance((prev) => prev - amount);
      setTransactions((prev) => [
        ...prev,
        { type: "Airtime", amount, to: "Self", date: new Date().toLocaleString() },
      ]);
      return `📱 Airtime of ₦${amount} don enter your line. New balance na ₦${balance - amount}.`;
    }

    if (intent === "check_balance") {
      return `💰 Your balance na ₦${balance}.`;
    }

    if (intent === "show_transaction_history") {
      if (transactions.length === 0) return "You never get any transaction yet.";
      return (
        "📜 Here be your last transactions:\n" +
        transactions
          .slice(-5)
          .map(
            (t) =>
              `${t.type} - ₦${t.amount} ${
                t.to ? `to ${t.to}` : ""
              } (${t.date})`
          )
          .join("\n")
      );
    }

    return null;
  };

  const handleSend = async () => {

/**
 * IMPORTANT:
 * - Ensure you installed: npm install @google/generative-ai
 * - Set env var: VITE_GEMINI_API_KEY=your_key_here
 *
 * This file is a single-file React app (option B). Paste into src/App.jsx.
 */

// ------------------------- Gemini init -------------------------
let genAI = null;
try {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (key) {
    genAI = new GoogleGenerativeAI(key);
  } else {
    console.warn("VITE_GEMINI_API_KEY missing — running in simulated mode.");
  }
} catch (e) {
  console.warn("Gemini init failed — running simulated mode.", e);
}

// Helper to get model instance (safe)
const getModel = (modelName = "models/gemini-2.5-flash") => {
  if (!genAI) return null;
  try {
    return genAI.getGenerativeModel({ model: modelName });
  } catch (e) {
    console.warn("getGenerativeModel failed:", e);
    return null;
  }
};

// ------------------------- Util: Language detection -------------------------
const detectLanguage = (text = "") => {
  if (!text) return "english";
  const s = text.toLowerCase();

  // pidgin keywords
  if (/\b(abeg|wey|una|omi|omo|i go|i go do|na)\b/.test(s)) return "pidgin";

  // yoruba detection (common characters / words)
  if (/[ṣọạẹẹọẹọ́àèìòùẹ]/.test(s) || /\b(mi |mi o|kin ni|se|owo|abẹ|gba)\b/.test(s)) return "yoruba";

  // igbo detection
  if (/\b(biko|nna|nne|ego|kedu|ime|onye)\b/.test(s) || /ị|ịbụ|ọzọ/.test(s)) return "igbo";

  // hausa detection
  if (/\b(kai|ina|yaya|sannu|don Allah|wallahi)\b/.test(s)) return "hausa";

  // default english
  return "english";
};

// ------------------------- TTS voice picker & helpers -------------------------
const pickVoiceForLanguage = (lang) => {
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;

  const findPrefer = (pattern) =>
    voices.find((v) => v.lang && v.lang.toLowerCase().includes(pattern));

  // prefer Nigerian-en when available (en-ng)
  if (lang === "pidgin" || lang === "yoruba" || lang === "igbo" || lang === "hausa") {
    return findPrefer("en-ng") || findPrefer("en-gb") || voices[0];
  }

  // english default: en-us > en-gb
  return findPrefer("en-us") || findPrefer("en-gb") || voices[0];
};

const speakText = (text, lang = "english", opts = {}) => {
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);

    // set voice & lang code if possible
    const voice = pickVoiceForLanguage(lang);
    if (voice) utter.voice = voice;

    // tune rate/pitch roughly per language to mimic cadence
    switch (lang) {
      case "yoruba":
        utter.rate = opts.rate ?? 0.92;
        utter.pitch = opts.pitch ?? 1.05;
        break;
      case "hausa":
        utter.rate = opts.rate ?? 0.95;
        utter.pitch = opts.pitch ?? 0.95;
        break;
      case "igbo":
        utter.rate = opts.rate ?? 1.0;
        utter.pitch = opts.pitch ?? 1.05;
        break;
      case "pidgin":
        utter.rate = opts.rate ?? 0.98;
        utter.pitch = opts.pitch ?? 1.0;
        break;
      default:
        utter.rate = opts.rate ?? 1.0;
        utter.pitch = opts.pitch ?? 1.0;
    }

    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.warn("TTS failed:", e);
  }
};

// ensure voices loaded in some browsers
const ensureVoicesLoaded = () => {
  return new Promise((res) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length) return res(true);
    window.speechSynthesis.onvoiceschanged = () => res(true);
    // fallback timeout
    setTimeout(() => res(!!window.speechSynthesis.getVoices().length), 1500);
  });
};

// ------------------------- localStorage user data helpers -------------------------
const USERS_KEY = "owo_users_v1";

const loadAllUsers = () => {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("Failed to parse users data:", e);
    return {};
  }
};

const saveAllUsers = (obj) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(obj));
};

// ------------------------- Intent extraction (simple heuristics) -------------------------
const parseIntentFromText = (text) => {
  const s = text.toLowerCase();
  // numbers extraction (first numeric token)
  const numMatch = s.match(/\b(\d{2,}|[0-9]+)\b/);
  const amount = numMatch ? parseInt(numMatch[0], 10) : null;

  // transfer patterns
  if (/\b(send|transfer|pay|give|transfer to|send to)\b/.test(s)) {
    // recipient heuristics: "to NAME" or "give NAME"
    const toMatch = s.match(/\b(?:to|give|for)\s+([A-Za-z0-9_]+)/);
    const recipient = toMatch ? toMatch[1] : "recipient";
    return { intent: "transfer", amount, recipient };
  }

  // airtime
  if (/\b(airtime|recharge|top ?up)\b/.test(s)) {
    return { intent: "buy_airtime", amount, recipient: null };
  }

  // balance
  if (/\b(balance|how much|how many|remain|wetin be my balance|kin ni balance)\b/.test(s)) {
    return { intent: "check_balance" };
  }

  // transactions/history
  if (/\b(history|transactions|last transactions|transaction history|show transactions)\b/.test(s)) {
    return { intent: "show_transaction_history" };
  }

  return { intent: null };
};

// ------------------------- Main App component -------------------------
export default function App() {
  // user/session state
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [users, setUsers] = useState(() => loadAllUsers());

  // chat state
  const [messages, setMessages] = useState([]); // {role: 'user'|'assistant', text: '', lang }
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  // speech recognition refs
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);

  // ensure voices loaded on mount
  useEffect(() => {
    ensureVoicesLoaded();
    // greet
    speakText("Owo ready. Please login to continue.", "english");
  }, []);

  // ------------------------- User management -------------------------
  const ensureUserExists = (name) => {
    const clean = name.trim().toLowerCase();
    const existing = users[clean];
    if (!existing) {
      const newUsers = {
        ...users,
        [clean]: { balance: 10000, transactions: [] }, // start balance
      };
      setUsers(newUsers);
      saveAllUsers(newUsers);
      return newUsers[clean];
    }
    return existing;
  };

  const handleLogin = () => {
    if (!username.trim()) return alert("Enter a username to continue");
    const clean = username.trim().toLowerCase();
    ensureUserExists(clean);
    setIsLoggedIn(true);
    setMessages([{ role: "assistant", text: `👋 Welcome ${clean}. How can I help you today?`, lang: "english" }]);
    speakText(`Welcome ${clean}. How can I help you today?`, "english");
  };

  // ------------------------- Speech recognition (voice input) -------------------------
  const startListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setMessages((prev) => [...prev, { role: "assistant", text: "Voice input not supported in this browser.", lang: "english" }]);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-NG"; // Accept Nigerian English; recognition still understands many phrases
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      recognition.stop();
      setInput(transcript);
      // auto-send
      handleSend(transcript);
    };
    recognition.onerror = (e) => {
      console.error("Speech recognition error:", e);
      setIsListening(false);
      setMessages((prev) => [...prev, { role: "assistant", text: "Voice input failed. Try typing.", lang: "english" }]);
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [messages, users, username]);

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch (e) {}
    setIsListening(false);
  };

  // ------------------------- Simulated transaction actions -------------------------
  const saveUserUpdates = (userKey, updates) => {
    const fresh = { ...users, [userKey]: { ...users[userKey], ...updates } };
    setUsers(fresh);
    saveAllUsers(fresh);
  };

  const runSimulatedAction = (userKey, parsedIntent) => {
    const userData = users[userKey];
    if (!userData) return "User account missing.";

    const { intent, amount, recipient } = parsedIntent;

    if (intent === "check_balance") {
      return `💰 Your balance is ₦${userData.balance}.`;
    }

    if (intent === "transfer") {
      const amt = amount || 0;
      if (amt <= 0) return "Please specify a valid amount.";
      if (userData.balance < amt) return "Transaction failed: insufficient funds.";
      const newBal = userData.balance - amt;
      const tx = { type: "Transfer", amount: amt, to: recipient || "recipient", date: new Date().toLocaleString() };
      saveUserUpdates(userKey, { balance: newBal, transactions: [...userData.transactions, tx] });
      return `✅ Transfer of ₦${amt} to ${recipient || "recipient"} completed. New balance: ₦${newBal}.`;
    }

    if (intent === "buy_airtime") {
      const amt = amount || 0;
      if (amt <= 0) return "Please specify airtime amount.";
      if (userData.balance < amt) return "Transaction failed: insufficient funds.";
      const newBal = userData.balance - amt;
      const tx = { type: "Airtime", amount: amt, to: "Self", date: new Date().toLocaleString() };
      saveUserUpdates(userKey, { balance: newBal, transactions: [...userData.transactions, tx] });
      return `📱 Airtime purchase of ₦${amt} successful. New balance: ₦${newBal}.`;
    }

    if (intent === "show_transaction_history") {
      const slice = (userData.transactions || []).slice(-8).reverse();
      if (!slice.length) return "You have no transactions yet.";
      return "📜 Recent transactions:\n" + slice.map(t => `${t.date} — ${t.type} — ₦${t.amount}${t.to ? ` — to ${t.to}` : ""}`).join("\n");
    }

    return null;
  };

  // ------------------------- Core: send message & process -------------------------
  // handleSend can accept optional explicitText (used by voice recognition)
  const handleSend = async (explicitText) => {
    const text = explicitText !== undefined ? explicitText : input;
    if (!text || !text.trim()) return;
    if (!isLoggedIn) {
      setMessages((prev) => [...prev, { role: "assistant", text: "Please login first.", lang: "english" }]);
      return;
    }

    const userKey = username.trim().toLowerCase();

    // append user message
    const userLang = detectLanguage(text);
    setMessages((prev) => [...prev, { role: "user", text, lang: userLang }]);
    setInput("");

    setIsThinking(true);

    try {
      // system prompt ensures Gemini replies in the same language and avoids JSON being shown
      const systemPrompt = `
You are Owo, a friendly multilingual financial assistant for Nigerian users.
You understand and respond in English, Nigerian Pidgin, Yoruba, Igbo, and Hausa.
Always reply in the SAME language as the user's message.
Do NOT output raw JSON or code blocks to the user. Respond naturally like a human assistant.
You can check balance, make transfers, buy airtime, and show transaction history.
If you need clarification ask a short question in the user's language.
`;

      // build conversation context (last ~10 messages to keep prompt small)
      const shortHistory = messages.slice(-8).map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`);
      // add the new user turn
      const inputTurn = `User: ${text}`;

      // use Gemini if available
      let botReplyText = null;
      const model = getModel("models/gemini-2.5-flash");
      if (model) {
        try {
          // Pass system prompt + conversation
          const response = await model.generateContent({
            // The SDK may accept array or structured content; using a simple approach
            // Many SDKs accept 'contents' array — if your SDK differs, adapt accordingly
            contents: [
              { parts: [{ text: systemPrompt }] },
              { parts: [{ text: shortHistory.join("\n") }] },
              { parts: [{ text }] }
            ],
            // optional: keep response modality text only
            model: "models/gemini-2.5-flash"
          });

          // SDK return may vary; try to read text safely
          const candidate = response?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidate) botReplyText = candidate;
          else if (response?.response?.text) botReplyText = response.response.text();
          else botReplyText = "Sorry, I couldn't formulate a reply right now.";
        } catch (gErr) {
          console.warn("Gemini call failed, falling back to simulated reply:", gErr);
        }
      }

      // If no bot reply from Gemini, give a polite simulated acknowledgement
      if (!botReplyText) {
        botReplyText = userLang === "pidgin" ? "Okay, make I check am..." : "Alright, let me handle that for you...";
      }

      // Attempt to parse intent from the raw user text (simple heuristics)
      const parsed = parseIntentFromText(text);
      // Run simulated action if intent exists
      const simulated = runSimulatedAction(userKey, parsed);

      // If an action was performed (simulated returned a non-null string), prefer that reply (so user sees concrete action)
      let finalReply = simulated || botReplyText;

      // Keep reply in same language as detection: attempt to run the translation through Gemini if parsed but only if model present
      // (We avoid printing JSON: replies are plain text)
      setMessages((prev) => [...prev, { role: "assistant", text: finalReply, lang: userLang }]);

      // Speak reply aloud using TTS in correct style
      await ensureVoicesLoaded();
      speakText(finalReply, userLang);

    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [...prev, { role: "assistant", text: "Sorry, something went wrong.", lang: "english" }]);
    } finally {
      setIsThinking(false);
    }
  };

  // UI helpers
  const lastMsgsRef = useRef(null);
  useEffect(() => {
    // auto-scroll
    lastMsgsRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // ------------------------- Render -------------------------
  if (!isLoggedIn) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.title}>💸 Owo — Personal Financial Assistant</h2>
          <input
            placeholder="Enter username (e.g. michael)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
          />
          <button onClick={handleLogin} style={styles.buttonPrimary}>Continue</button>
          <p style={{ marginTop: 12, color: "#cfcfcf" }}>
            Data is stored locally in your browser. Each username has private balance & history.
          </p>
        </div>
      </div>
    );
  }

  const userKey = username.trim().toLowerCase();
  const userData = users[userKey] || { balance: 0, transactions: [] };

  return (
    <div style={styles.container}>
      <div style={{ ...styles.card, width: 820, maxWidth: "95%" }}>
        <div style={styles.header}>
          <div>
            <h2 style={{ margin: 0 }}>💬 Owo — Multilingual Financial Assistant</h2>
            <div style={{ fontSize: 13, color: "#cfcfcf" }}>Logged in as <b>{userKey}</b> • ₦{userData.balance}</div>
          </div>
          <div>
            <button style={styles.smallButton} onClick={() => { navigator.clipboard?.writeText(window.location.href); }}>Copy Link</button>
          </div>
        </div>

        <div style={styles.chatWindow}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
              <div style={{ ...styles.bubble, background: m.role === "user" ? "#6b21a8" : "#1f2937", color: "#fff", maxWidth: "78%" }}>
                <div style={{ fontSize: 13, opacity: 0.9 }}>{m.text}</div>
              </div>
            </div>
          ))}
          <div ref={lastMsgsRef} />
        </div>

        <div style={styles.controls}>
          <button
            title={isListening ? "Listening..." : "Start voice input"}
            onClick={() => (isListening ? stopListening() : startListening())}
            style={{ ...styles.micButton, background: isListening ? "#ef4444" : "#111827" }}
          >
            {isListening ? "● Listening" : "🎤 Speak"}
          </button>

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message here (or press Speak)..."
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            style={styles.chatInput}
            disabled={isThinking}
          />

          <button onClick={() => handleSend()} style={styles.buttonPrimary} disabled={isThinking}>
            {isThinking ? "Thinking..." : "Send"}
          </button>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#cfcfcf" }}>Quick examples:</div>
          <button style={styles.tag} onClick={() => { setInput("Check my balance"); setTimeout(() => handleSend(), 50); }}>Check my balance</button>
          <button style={styles.tag} onClick={() => { setInput("Abeg send 2000 to Tunde"); setTimeout(() => handleSend(), 50); }}>Abeg send 2000 to Tunde</button>
          <button style={styles.tag} onClick={() => { setInput("Help me buy 100 airtime"); setTimeout(() => handleSend(), 50); }}>Buy airtime 100</button>
          <button style={styles.tag} onClick={() => { setInput("Show my transaction history"); setTimeout(() => handleSend(), 50); }}>Show history</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------- Simple inline styles -------------------------
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
    borderRadius: 12,
    padding: 18,
    boxShadow: "0 10px 30px rgba(2,6,23,0.8)",
  },
  title: {
    marginBottom: 10,
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  chatWindow: {
    height: "55vh",
    overflowY: "auto",
    padding: 12,
    borderRadius: 8,
    background: "#081127",
    border: "1px solid rgba(255,255,255,0.02)",
    marginBottom: 12,
  },
  bubble: {
    padding: 12,
    borderRadius: 10,
    lineHeight: 1.3,
    whiteSpace: "pre-wrap",
  },
  controls: { display: "flex", gap: 8, alignItems: "center" },
  chatInput: {
    flex: 1,
    minWidth: 0,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "#0b1220",
    color: "#fff",
  },
  buttonPrimary: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#7c3aed",
    color: "#fff",
    cursor: "pointer",
  },
  smallButton: {
    padding: "6px 8px",
    borderRadius: 6,
    background: "#0f172a",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.04)",
    cursor: "pointer",
  },
  micButton: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "none",
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
    minWidth: 110,
  },
  tag: {
    background: "#111827",
    border: "1px solid rgba(255,255,255,0.03)",
    padding: "6px 8px",
    borderRadius: 6,
    cursor: "pointer",
    color: "#cfcfcf",
    fontSize: 13,
  },
};
