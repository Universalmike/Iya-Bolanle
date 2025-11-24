import React, { useEffect, useState, useRef, useCallback } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * IMPORTANT:
 * - Ensure you installed: npm install @google/generative-ai
 * - Set env var: VITE_GEMINI_API_KEY=your_key_here
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

const getModel = (modelName = "models/gemini-2.5-flash") => {
  if (!genAI) return null;
  try {
    return genAI.getGenerativeModel({ model: modelName });
  } catch (e) {
    console.warn("getGenerativeModel failed:", e);
    return null;
  }
};

// ------------------------- Language Detection -------------------------
const detectLanguage = (text = "") => {
  if (!text) return "english";
  const s = text.toLowerCase();

  // Enhanced Pidgin detection (more keywords)
  if (/\b(abeg|wey|una|omo|i go|na so|wetin|dey|make|e be like|sef|o|shey|dem)\b/.test(s)) return "pidgin";

  // Enhanced Yoruba detection (more diacritics and common words)
  if (/[ṣọẹ́àèìòù]/i.test(s) || /\b(mi|ni|ti|kin|se|owo|je|lo|wa|ba|gba|fun|lati|nigba|abi)\b/.test(s)) return "yoruba";

  // Enhanced Igbo detection
  if (/\b(biko|nna|nne|ego|kedu|ime|onye|na|nwa|ya|ka|di|gi|anyi|obi)\b/.test(s) || /[ịọụ]/i.test(s)) return "igbo";

  // Enhanced Hausa detection
  if (/\b(kai|ina|yaya|sannu|don allah|wallahi|kuma|da|a|ba|na|ta|ga|yi|ce|ko)\b/.test(s)) return "hausa";

  // default english
  return "english";
};

// ------------------------- Text-to-Speech Helpers -------------------------
const stripEmojis = (text) => {
  return text.replace(/(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g, '');
};

const pickVoiceForLanguage = (lang) => {
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;

  const findPrefer = (pattern) =>
    voices.find((v) => v.lang && v.lang.toLowerCase().includes(pattern));

  if (lang === "pidgin" || lang === "yoruba" || lang === "igbo" || lang === "hausa") {
    return findPrefer("en-ng") || findPrefer("en-gb") || voices[0];
  }

  return findPrefer("en-us") || findPrefer("en-gb") || voices[0];
};

const speakText = (text, lang = "english", opts = {}) => {
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    
    const cleanText = stripEmojis(text); 
    const utter = new SpeechSynthesisUtterance(cleanText);

    const voice = pickVoiceForLanguage(lang);
    if (voice) utter.voice = voice;

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

const ensureVoicesLoaded = () => {
  return new Promise((res) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length) return res(true);
    window.speechSynthesis.onvoiceschanged = () => res(true);
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

// ------------------------- Intent extraction -------------------------
const parseIntentFromText = (text) => {
  const s = text.toLowerCase();
  
  let amount = null;
  
  let numMatch = s.match(/(\d{1,3}(,\d{3})*|\d+)/);
  if (numMatch) {
    amount = parseInt(numMatch[0].replace(/,/g, ''), 10);
  }
  
  if (!amount) {
    const wordMatch = s.match(/\b(one|two|three|four|five|ten|twenty)\s+thousand\b/);
    if (wordMatch) {
      const multiplierMap = { 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'ten': 10, 'twenty': 20 };
      const word = wordMatch[1];
      amount = multiplierMap[word] * 1000;
    }
  }

  if (/\b(send|transfer|pay|give|transfer to|send to)\b/.test(s)) {
    const toMatch = s.match(/\b(?:to|give|for)\s+([A-Za-z0-9_]+)/);
    const recipient = toMatch ? toMatch[1] : "recipient";
    return { intent: "transfer", amount, recipient };
  }

  if (/\b(airtime|recharge|top ?up)\b/.test(s)) {
    return { intent: "buy_airtime", amount, recipient: null };
  }

  if (/\b(balance|how much|how many|remain|wetin be my balance|kin ni balance)\b/.test(s)) {
    return { intent: "check_balance" };
  }

  if (/\b(history|transactions|last transactions|transaction history|show transactions)\b/.test(s)) {
    return { intent: "show_transaction_history" };
  }

  return { intent: null };
};

// ------------------------- Main App component -------------------------
export default function App() {
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [users, setUsers] = useState(() => loadAllUsers());
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    ensureVoicesLoaded();
    speakText("Owo ready. Please login to continue.", "english");
  }, []);

  // ------------------------- User management -------------------------
  const ensureUserExists = (name) => {
    const clean = name.trim().toLowerCase();
    const existing = users[clean];
    if (!existing) {
      const newUsers = {
        ...users,
        [clean]: { balance: 10000, transactions: [] },
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

  const saveUserUpdates = (userKey, updates) => {
    const fresh = { ...users, [userKey]: { ...users[userKey], ...updates } };
    setUsers(fresh);
    saveAllUsers(fresh);
  };

  // ------------------------- Transaction Actions -------------------------
  const runSimulatedAction = (userKey, parsedIntent, userLang = "english") => {
    const userData = users[userKey];
    if (!userData) return "User account missing.";

    const { intent, amount, recipient } = parsedIntent;

    const responses = {
      check_balance: {
        english: `💰 Your balance is ₦${userData.balance}.`,
        pidgin: `💰 Your balance na ₦${userData.balance}.`,
        yoruba: `💰 Owó tó wà nílẹ̀ rẹ jẹ́ ₦${userData.balance}.`,
        igbo: `💰 Ego gị bụ ₦${userData.balance}.`,
        hausa: `💰 Kuɗin ku ya kai ₦${userData.balance}.`
      },
      insufficient_funds: {
        english: "Transaction failed: insufficient funds.",
        pidgin: "E no work o: money no reach.",
        yoruba: "Ìṣòwò kò ṣe: owó kò tó.",
        igbo: "Azụmahịa adabeghị: ego ezughị.",
        hausa: "Cinikin ya kasa: kuɗi bai isa ba."
      },
      transfer_success: (amt, recip, newBal) => ({
        english: `✅ Transfer of ₦${amt} to ${recip} completed. New balance: ₦${newBal}.`,
        pidgin: `✅ I don send ₦${amt} give ${recip}. Your balance now na ₦${newBal}.`,
        yoruba: `✅ Mo ti fi ₦${amt} ránṣẹ́ sí ${recip}. Owó tó kù: ₦${newBal}.`,
        igbo: `✅ E zigara ${recip} ₦${amt}. Ego fọdụrụ: ₦${newBal}.`,
        hausa: `✅ An aika ₦${amt} zuwa ${recip}. Saura: ₦${newBal}.`
      }),
      airtime_success: (amt, newBal) => ({
        english: `📱 Airtime purchase of ₦${amt} successful. New balance: ₦${newBal}.`,
        pidgin: `📱 I don buy ₦${amt} airtime. Your balance now na ₦${newBal}.`,
        yoruba: `📱 Mo ti ra airtime ₦${amt}. Owó tó kù: ₦${newBal}.`,
        igbo: `📱 E zụtara airtime ₦${amt}. Ego fọdụrụ: ₦${newBal}.`,
        hausa: `📱 An sayi airtime ₦${amt}. Saura: ₦${newBal}.`
      })
    };

    if (intent === "check_balance") {
      return responses.check_balance[userLang] || responses.check_balance.english;
    }

    if (intent === "transfer") {
      const amt = amount || 0;
      if (amt <= 0) return "Please specify a valid amount.";
      if (userData.balance < amt) return responses.insufficient_funds[userLang] || responses.insufficient_funds.english;
      const newBal = userData.balance - amt;
      const tx = { type: "Transfer", amount: amt, to: recipient || "recipient", date: new Date().toLocaleString() };
      saveUserUpdates(userKey, { balance: newBal, transactions: [...userData.transactions, tx] });
      const successMsg = responses.transfer_success(amt, recipient || "recipient", newBal);
      return successMsg[userLang] || successMsg.english;
    }

    if (intent === "buy_airtime") {
      const amt = amount || 0;
      if (amt <= 0) return "Please specify airtime amount.";
      if (userData.balance < amt) return responses.insufficient_funds[userLang] || responses.insufficient_funds.english;
      const newBal = userData.balance - amt;
      const tx = { type: "Airtime", amount: amt, to: "Self", date: new Date().toLocaleString() };
      saveUserUpdates(userKey, { balance: newBal, transactions: [...userData.transactions, tx] });
      const successMsg = responses.airtime_success(amt, newBal);
      return successMsg[userLang] || successMsg.english;
    }

    if (intent === "show_transaction_history") {
      const slice = (userData.transactions || []).slice(-8).reverse();
      if (!slice.length) return "You have no transactions yet.";
      return "📜 Recent transactions:\n" + slice.map(t => `${t.date} — ${t.type} — ₦${t.amount}${t.to ? ` — to ${t.to}` : ""}`).join("\n");
    }

    return null;
  };

  // ------------------------- Speech recognition -------------------------
  const startListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setMessages((prev) => [...prev, { role: "assistant", text: "Voice input not supported in this browser.", lang: "english" }]);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-NG";
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

  // ------------------------- Core: send message & process -------------------------
  const handleSend = async (explicitText) => {
    const text = explicitText !== undefined ? explicitText : input;
    if (!text || !text.trim()) return;
    if (!isLoggedIn) {
      setMessages((prev) => [...prev, { role: "assistant", text: "Please login first.", lang: "english" }]);
      return;
    }

    const userKey = username.trim().toLowerCase();
    const userData = users[userKey];

    const userLang = detectLanguage(text);
    setMessages((prev) => [...prev, { role: "user", text, lang: userLang }]);
    setInput("");

    setIsThinking(true);

    try {
      const languageInstructions = {
        english: "Respond in natural English",
        pidgin: "Respond ONLY in Nigerian Pidgin English. Use phrases like 'abeg', 'wetin', 'e be like say', 'omo', 'wahala', 'shey', 'o'. Be very natural and conversational.",
        yoruba: "Respond ONLY in Yoruba language. Use proper Yoruba expressions with diacritics like ẹ, ọ, ṣ. Examples: 'Báwo ni', 'Ṣe daadaa', 'Mo gbọ́', 'Kò sí wàhálà'",
        igbo: "Respond ONLY in Igbo language. Use natural Igbo with proper tone marks like ị, ọ, ụ. Examples: 'Ọ dị mma', 'Kedu', 'Biko', 'Nke ọma'",
        hausa: "Respond ONLY in Hausa language. Use natural Hausa expressions. Examples: 'Sannu', 'Yaya kake', 'To madalla', 'Don Allah'"
      };

      const systemPrompt = `You are Owo, a Nigerian multilingual financial assistant.

CRITICAL: The user is speaking in ${userLang.toUpperCase()}.
${languageInstructions[userLang]}

Rules:
1. Reply 100% in ${userLang.toUpperCase()} - DO NOT use English or any other language
2. Keep responses SHORT (1-2 sentences) and friendly
3. Use natural, conversational tone for native speakers
4. For financial transactions, confirm details in ${userLang.toUpperCase()}

User's current balance: ₦${userData.balance}`;

      const shortHistory = messages.slice(-6).map(m => 
        `${m.role === "user" ? "User" : "Assistant"} (${m.lang}): ${m.text}`
      ).join("\n");

      let botReplyText = null;
      const model = getModel("models/gemini-2.5-flash");
      if (model) {
        try {
          const fullPrompt = `${systemPrompt}

Previous conversation:
${shortHistory}

User (${userLang}): ${text}

Assistant (${userLang}):`;

          const response = await model.generateContent(fullPrompt);

          const candidate = response?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidate) botReplyText = candidate;
          else if (response?.text) botReplyText = response.text;
          else botReplyText = "Sorry, I couldn't formulate a reply right now.";
        } catch (gErr) {
          console.warn("Gemini call failed, falling back to simulated reply:", gErr);
        }
      }

      if (!botReplyText) {
        const fallbacks = {
          pidgin: "Okay, make I check am... Wetin you wan make I do?",
          yoruba: "Ó dára, jẹ́ ń wo ó... Kí ni mo lè ṣe fún ọ?",
          igbo: "Ọ dị mma, ka m lelee ya... Gịnị ka m ga-eme?",
          hausa: "To madalla, bari in duba... Me zan yi?",
          english: "Alright, let me check that for you..."
        };
        botReplyText = fallbacks[userLang] || fallbacks.english;
      }

      const parsed = parseIntentFromText(text);
      const simulated = runSimulatedAction(userKey, parsed, userLang);

      let finalReply = simulated || botReplyText;

      setMessages((prev) => [...prev, { role: "assistant", text: finalReply, lang: userLang }]);

      await ensureVoicesLoaded();
      speakText(finalReply, userLang);

    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [...prev, { role: "assistant", text: "Sorry, something went wrong.", lang: "english" }]);
    } finally {
      setIsThinking(false);
    }
  };

  const lastMsgsRef = useRef(null);
  useEffect(() => {
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
            placeholder="Type your message here (e.g. Abeg send 2000 to Tunde)"
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            style={styles.chatInput}
            disabled={isThinking}
          />

          <button onClick={() => handleSend()} style={styles.buttonPrimary} disabled={isThinking}>
            {isThinking ? "Thinking..." : "Send"}
          </button>
        </div>

        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#cfcfcf", width: "100%", marginBottom: 4 }}>Quick examples:</div>
          <button style={styles.tag} onClick={() => { setInput("Check my balance"); setTimeout(() => handleSend(), 50); }}>Check balance</button>
          <button style={styles.tag} onClick={() => { setInput("Abeg check my balance"); setTimeout(() => handleSend(), 50); }}>Abeg check my balance (Pidgin)</button>
          <button style={styles.tag} onClick={() => { setInput("Abeg send 2000 to Tunde"); setTimeout(() => handleSend(), 50); }}>Abeg send 2000 (Pidgin)</button>
          <button style={styles.tag} onClick={() => { setInput("Ṣe àyẹ̀wò owó mi"); setTimeout(() => handleSend(), 50); }}>Ṣe àyẹ̀wò owó (Yoruba)</button>
          <button style={styles.tag} onClick={() => { setInput("Biko lelee ego m"); setTimeout(() => handleSend(), 50); }}>Biko lelee ego (Igbo)</button>
          <button style={styles.tag} onClick={() => { setInput("Help me buy 100 airtime"); setTimeout(() => handleSend(), 50); }}>Buy airtime 100</button>
        </div>
      </div>
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
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "#0b1220",
    color: "#fff",
    marginBottom: 12,
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
