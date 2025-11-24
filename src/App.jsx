import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";

// ------------------------- Backend URL -------------------------
const API_URL = "https://your-backend.onrender.com"; // <-- replace with your deployed backend URL

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);

  // ------------------------- TTS helpers -------------------------
  const speakText = (text) => {
    if (!("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  };

  // ------------------------- Auth -------------------------
  const handleSignup = async () => {
    if (!username || !password) return alert("Enter all fields");

    try {
      const res = await axios.post(`${API_URL}/signup`, { username, password });
      alert(res.data.message);
    } catch (err) {
      alert(err.response?.data?.message || "Signup failed");
    }
  };

  const handleLogin = async () => {
    if (!username || !password) return alert("Enter all fields");

    try {
      const res = await axios.post(`${API_URL}/login`, { username, password });
      setIsLoggedIn(true);
      setMessages([
        { role: "assistant", text: `👋 Welcome ${username}. How can I assist you today?` },
      ]);
      speakText(`Welcome ${username}. How can I assist you today?`);
    } catch (err) {
      alert(err.response?.data?.message || "Login failed");
    }
  };

  // ------------------------- Transaction / action -------------------------
  const handleSend = async (explicitText) => {
    const text = explicitText ?? input;
    if (!text.trim()) return;
    if (!isLoggedIn) {
      setMessages((prev) => [...prev, { role: "assistant", text: "Please login first." }]);
      return;
    }

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setIsThinking(true);

    try {
      const res = await axios.post(`${API_URL}/action`, { username, text });
      const reply = res.data.balance !== undefined ? `💰 Your balance: ₦${res.data.balance}` : res.data.message;
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      speakText(reply);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", text: "Server error. Try again." }]);
    } finally {
      setIsThinking(false);
    }
  };

  // ------------------------- Speech recognition -------------------------
  const startListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setMessages((prev) => [...prev, { role: "assistant", text: "Voice input not supported." }]);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-NG";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      recognition.stop();
      handleSend(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch (e) {}
    setIsListening(false);
  };

  // ------------------------- Render -------------------------
  if (!isLoggedIn) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.title}>💸 SARA — Personal Financial Assistant</h2>
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
          />
          <button onClick={handleSignup} style={styles.buttonPrimary}>Sign Up</button>
          <button onClick={handleLogin} style={styles.buttonPrimary}>Login</button>
          <p style={{ marginTop: 12, color: "#cfcfcf" }}>
            Your account is securely stored using SQLite database.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.chatWindow}>
          {messages.map((m, idx) => (
            <div key={idx} style={{ ...styles.bubble, background: m.role === "user" ? "#1f2937" : "#4b5563" }}>
              {m.text}
            </div>
          ))}
          {isThinking && <div style={styles.bubble}>SARA is thinking...</div>}
        </div>
        <div style={styles.controls}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message"
            style={styles.chatInput}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button onClick={() => handleSend()} style={styles.buttonPrimary}>Send</button>
          <button onClick={isListening ? stopListening : startListening} style={styles.buttonPrimary}>
            {isListening ? "Stop" : "🎤"}
          </button>
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
  title: { marginBottom: 10 },
  chatWindow: {
    height: "55vh",
    overflowY: "auto",
    padding: 12,
    borderRadius: 8,
    background: "#081127",
    border: "1px solid rgba(255,255,255,0.02)",
    marginBottom: 12,
  },
  bubble: { padding: 12, borderRadius: 10, lineHeight: 1.3, marginBottom: 8, whiteSpace: "pre-wrap" },
  controls: { display: "flex", gap: 8, alignItems: "center" },
  chatInput: { flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", background: "#0b1220", color: "#fff" },
  input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", background: "#0b1220", color: "#fff", marginBottom: 12 },
  buttonPrimary: { padding: "10px 14px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", cursor: "pointer" },
};

