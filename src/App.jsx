import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { API_URL } from "./config";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);

  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);

  // ------------------------- Gemini init -------------------------
  let genAI = null;
  try {
    const key = import.meta.env.VITE_GEMINI_API_KEY;
    if (key) genAI = new GoogleGenerativeAI(key);
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
    if (/\b(abeg|wey|una|omo|i go|na so|wetin|dey|make|e be like|sef|o|shey|dem|una)\b/.test(s)) return "pidgin";
    if (/[ṣọẹ́àèìòù]/i.test(s) || /\b(mi|ni|bami|ra|ti|kin|se|owo|je|lo|wa|ba|gba|fun|lati|nigba|abi)\b/.test(s)) return "yoruba";
    if (/\b(biko|nna|nne|ego|kedu|ime|onye|na|nwa|ya|ka|di|gi|anyi|obi)\b/.test(s) || /[ịọụ]/i.test(s)) return "igbo";
    if (/\b(kai|ina|yaya|sannu|don allah|wallahi|kuma|da|a|ba|na|ta|ga|yi|ce|ko)\b/.test(s)) return "hausa";
    return "english";
  };

  // ------------------------- Text-to-Speech -------------------------
  const stripEmojis = (text) => text.replace(/(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g, '');

  const pickVoiceForLanguage = (lang) => {
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const findPrefer = (pattern) => voices.find((v) => v.lang && v.lang.toLowerCase().includes(pattern));
    if (["pidgin","yoruba","igbo","hausa"].includes(lang)) return findPrefer("en-ng") || findPrefer("en-gb") || voices[0];
    return findPrefer("en-us") || findPrefer("en-gb") || voices[0];
  };

  const speakText = (text, lang = "english", opts = {}) => {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(stripEmojis(text));
      const voice = pickVoiceForLanguage(lang);
      if (voice) utter.voice = voice;
      utter.rate = opts.rate ?? 1.0;
      utter.pitch = opts.pitch ?? 1.0;
      window.speechSynthesis.speak(utter);
    } catch (e) { console.warn("TTS failed:", e); }
  };

  const ensureVoicesLoaded = () => new Promise((res) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) return res(true);
    window.speechSynthesis.onvoiceschanged = () => res(true);
    setTimeout(() => res(!!window.speechSynthesis.getVoices().length), 1500);
  });

  // ------------------------- Backend API calls -------------------------
  const handleSignup = async () => {
    if (!username || !password) return alert("Enter all fields");

    try {
      const res = await axios.post(`${API_URL}/signup`, { username, password });
      alert(res.data.message || "Signup successful!");
    } catch (err) {
      alert(err.response?.data?.message || "Signup failed");
    }
  };

  const handleLogin = async () => {
    if (!username || !password) return alert("Enter all fields");

    try {
      const res = await axios.post(`${API_URL}/login`, { username, password });
      const data = res.data;
      setBalance(data.balance);
      setTransactions(data.transactions || []);
      setIsLoggedIn(true);
      setMessages([{ role: "assistant", text: `Welcome ${username}!`, lang: "english" }]);
      speakText(`Welcome ${username}!`, "english");
    } catch (err) {
      alert(err.response?.data?.message || "Login failed");
    }
  };

  const fetchTransactions = async () => {
    if (!username) return;
    try {
      const res = await axios.get(`${API_URL}/transactions?username=${username}`);
      setTransactions(res.data.transactions || []);
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    }
  };

  useEffect(() => { if (isLoggedIn) fetchTransactions(); }, [isLoggedIn]);

  // ------------------------- Handle sending messages -------------------------
  const handleSend = async (text) => {
    if (!text.trim() || !isLoggedIn) return;

    const userLang = detectLanguage(text);
    setMessages((prev) => [...prev, { role: "user", text, lang: userLang }]);
    setInput("");
    setIsThinking(true);

    // Call backend for transaction intents
    try {
      const res = await axios.post(`${API_URL}/action`, { username, text });
      const reply = res.data.reply || "Sorry, I couldn't process that.";
      setMessages((prev) => [...prev, { role: "assistant", text: reply, lang: userLang }]);
      speakText(reply, userLang);
      fetchTransactions();
    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, { role: "assistant", text: "Server error", lang: "english" }]);
    } finally {
      setIsThinking(false);
    }
  };

  // ------------------------- Render -------------------------
  if (!isLoggedIn) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.title}>💸 SARA — Personal Financial Assistant</h2>
          <input placeholder="Username" value={username} onChange={(e)=>setUsername(e.target.value)} style={styles.input}/>
          <input type="password" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} style={styles.input}/>
          <button onClick={handleSignup} style={styles.buttonPrimary}>Sign Up</button>
          <button onClick={handleLogin} style={styles.buttonPrimary}>Login</button>
          <p style={{ marginTop: 12, color: "#cfcfcf" }}>Your account is securely stored using SQLite database.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>💬 Chat with SARA</h2>
        <div style={{ maxHeight: 400, overflowY: "auto", marginBottom: 10 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <b>{m.role === "user" ? "You" : "SARA"}:</b> {m.text}
            </div>
          ))}
        </div>
        <input value={input} onChange={(e)=>setInput(e.target.value)} style={styles.input} placeholder="Type your message"/>
        <button onClick={()=>handleSend(input)} style={styles.buttonPrimary}>Send</button>
        <div style={{ marginTop: 20 }}>
          <h3>💰 Balance: ₦{balance}</h3>
          <h4>📜 Transactions:</h4>
          <ul>
            {transactions.map((t, i) => (
              <li key={i}>{t.date} — {t.type} — ₦{t.amount} {t.to ? `— to ${t.to}` : ""}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ------------------------- Styles -------------------------
const styles = {
  container: { minHeight: "100vh", background: "linear-gradient(180deg,#0f172a 0%, #060818 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, color: "#fff", fontFamily: "Inter, system-ui, sans-serif" },
  card: { width: 900, maxWidth: "95%", background: "#0b1220", borderRadius: 12, padding: 18, boxShadow: "0 10px 30px rgba(2,6,23,0.8)" },
  title: { marginBottom: 10 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", background: "#0b1220", color: "#fff", marginBottom: 12 },
  buttonPrimary: { padding: "10px 14px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", cursor: "pointer" },
};

