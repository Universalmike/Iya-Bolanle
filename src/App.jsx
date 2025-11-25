import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";

// ------------------------- Backend URL -------------------------
const API_URL = "https://Iya-Bolanle-backend.onrender.com";

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const chatEndRef = useRef(null);
  const [showEsusu, setShowEsusu] = useState(false);
  const [esusuGroups, setEsusuGroups] = useState([]);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ------------------------- TTS -------------------------
  const speakText = (text) => {
    if (!("speechSynthesis" in window)) return;
    
    // Remove emojis and special characters for speech
    const cleanText = text
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis (proper unicode range)
      .replace(/[\u{2600}-\u{26FF}]/gu, '') // Remove misc symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, '') // Remove dingbats
      .replace(/₦/g, 'Naira ') // Replace Naira symbol with word
      .trim();
    
    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.rate = 1.1;
    utter.pitch = 1.0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  };

  // ------------------------- Auth -------------------------
  const handleSignup = async () => {
    if (!username || !password) return alert("Please enter both username and password");
    try {
      const res = await axios.post(`${API_URL}/signup`, { username, password });
      alert(res.data.message);
    } catch (err) {
      alert(err.response?.data?.message || "Signup failed");
    }
  };

  const handleLogin = async () => {
    if (!username || !password) return alert("Please enter both username and password");
    try {
      const res = await axios.post(`${API_URL}/login`, { username, password });
      setIsLoggedIn(true);
      const welcomeMsg = `Hi ${username}! I'm SARA, your personal financial assistant. I'm here to help you manage your money. You can ask me to check your balance, buy airtime, transfer funds, or view your transaction history. What would you like to do?`;
      setMessages([{ role: "assistant", text: welcomeMsg }]);
      speakText(`Welcome back ${username}! I'm SARA, your personal financial assistant. How can I help you today?`);
    } catch (err) {
      alert(err.response?.data?.message || "Login failed");
    }
  };

  // ------------------------- Esusu Functions -------------------------
  const fetchEsusuGroups = async () => {
    try {
      const res = await axios.get(`${API_URL}/esusu/my-groups/${username}`);
      setEsusuGroups(res.data.groups || []);
    } catch (err) {
      console.error("Could not fetch esusu groups");
    }
  };

  const createEsusuGroup = async (groupName, amount, frequency, members) => {
    try {
      const res = await axios.post(`${API_URL}/esusu/create`, {
        username,
        groupName,
        amountPerPerson: parseInt(amount),
        frequency,
        totalMembers: parseInt(members)
      });
      setMessages((prev) => [...prev, { role: "assistant", text: res.data.message }]);
      speakText(res.data.speak || res.data.message);
      fetchEsusuGroups();
    } catch (err) {
      const errorMsg = err.response?.data?.message || "Could not create group";
      setMessages((prev) => [...prev, { role: "assistant", text: errorMsg }]);
      speakText(errorMsg);
    }
  };

  const joinEsusuGroup = async (groupName) => {
    try {
      const res = await axios.post(`${API_URL}/esusu/join`, { username, groupName });
      setMessages((prev) => [...prev, { role: "assistant", text: res.data.message }]);
      speakText(res.data.speak || res.data.message);
      fetchEsusuGroups();
    } catch (err) {
      const errorMsg = err.response?.data?.message || "Could not join group";
      setMessages((prev) => [...prev, { role: "assistant", text: errorMsg }]);
      speakText(errorMsg);
    }
  };

  const contributeToEsusu = async (groupName) => {
    try {
      const res = await axios.post(`${API_URL}/esusu/contribute`, { username, groupName });
      setMessages((prev) => [...prev, { role: "assistant", text: res.data.message }]);
      speakText(res.data.speak || res.data.message);
      fetchEsusuGroups();
    } catch (err) {
      const errorMsg = err.response?.data?.message || "Could not contribute";
      setMessages((prev) => [...prev, { role: "assistant", text: errorMsg }]);
      speakText(errorMsg);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchEsusuGroups();
    }
  }, [isLoggedIn]);

  // ------------------------- Fetch History -------------------------
  const fetchHistory = async () => {
    setIsThinking(true);
    try {
      const res = await axios.get(`${API_URL}/history/${username}`);
      
      if (!res.data.transactions || res.data.transactions.length === 0) {
        setMessages((prev) => [...prev, { 
          role: "assistant", 
          text: "You don't have any transaction history yet. Start by checking your balance or making a transaction!" 
        }]);
        speakText("You have no transactions yet.");
      } else {
        const historyText = "📊 Here's your recent transaction history:\n\n" + 
          res.data.transactions
            .map((t) => {
              const date = new Date(t.date).toLocaleString('en-NG', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              
              let emoji = "💳";
              if (t.type === "Airtime") emoji = "📱";
              if (t.type === "Transfer") emoji = "💸";
              if (t.type === "Received") emoji = "💰";
              
              return `${emoji} ${date} — ${t.type} ₦${t.amount.toLocaleString()}${
                t.to_user && t.to_user !== "Self" ? " → " + t.to_user : ""
              }`;
            })
            .join("\n");
        
        setMessages((prev) => [...prev, { role: "assistant", text: historyText }]);
        speakText("Here's your transaction history.");
      }
    } catch (err) {
      setMessages((prev) => [...prev, { 
        role: "assistant", 
        text: "Oops! I couldn't fetch your transaction history. Please try again." 
      }]);
      speakText("Could not fetch history.");
    } finally {
      setIsThinking(false);
    }
  };

  // ------------------------- Send Action -------------------------
  const handleSend = async (explicitText) => {
    const text = explicitText ?? input;
    if (!text.trim()) return;
    
    if (!isLoggedIn) {
      setMessages((prev) => [...prev, { 
        role: "assistant", 
        text: "Please login first to use SARA's services." 
      }]);
      return;
    }

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setIsThinking(true);

    try {
      const res = await axios.post(`${API_URL}/action`, { username, text });
      const reply = res.data.message;
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      
      // Use the speak version if available, otherwise clean the message
      const speechText = res.data.speak || reply;
      speakText(speechText);
    } catch (err) {
      const errorMsg = err.response?.data?.message || "Sorry, something went wrong. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", text: errorMsg }]);
      speakText(errorMsg);
    } finally {
      setIsThinking(false);
    }
  };

  // ------------------------- Speech recognition -------------------------
  const startListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setMessages((prev) => [...prev, { 
        role: "assistant", 
        text: "Sorry, voice input is not supported in your browser. Try Chrome or Edge!" 
      }]);
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
    recognition.onerror = () => {
      setIsListening(false);
      setMessages((prev) => [...prev, { 
        role: "assistant", 
        text: "I couldn't hear that clearly. Please try again." 
      }]);
    };
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, [username, isLoggedIn]);

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch (err) {
      console.log("Stop listening error:", err);
    }
    setIsListening(false);
  };

  // ------------------------- Render -------------------------
  if (!isLoggedIn) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.title}>💸 SARA</h1>
            <p style={styles.subtitle}>Your Personal Financial Assistant</p>
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
          <div style={{ display: "flex", gap: 8 }}>
            <button 
              onClick={() => setShowEsusu(!showEsusu)} 
              style={{
                ...styles.esusuButton,
                background: showEsusu ? "#7c3aed" : "rgba(124,58,237,0.1)"
              }}
            >
              {showEsusu ? "💬 Chat" : "🤝 Esusu"}
            </button>
            <button 
              onClick={() => {
                setIsLoggedIn(false);
                setMessages([]);
                setUsername("");
                setPassword("");
                setShowEsusu(false);
              }} 
              style={styles.logoutButton}
            >
              Logout
            </button>
          </div>
        </div>

        {showEsusu ? (
          <EsusuView 
            groups={esusuGroups}
            onCreateGroup={createEsusuGroup}
            onJoinGroup={joinEsusuGroup}
            onContribute={contributeToEsusu}
            username={username}
          />
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
                  SARA is thinking...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div style={styles.quickActions}>
              <button 
                onClick={() => handleSend("check balance")} 
                style={styles.quickButton}
                disabled={isThinking}
              >
                💰 Balance
              </button>
              <button 
                onClick={() => handleSend("buy 100 airtime")} 
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
                onClick={isListening ? stopListening : startListening} 
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

// ------------------------- Esusu View Component -------------------------
function EsusuView({ groups, onCreateGroup, onJoinGroup, onContribute, username }) {
  const [view, setView] = useState("list"); // list, create, join
  const [formData, setFormData] = useState({
    groupName: "",
    amount: "",
    frequency: "monthly",
    members: "5"
  });

  const handleCreate = () => {
    if (!formData.groupName || !formData.amount || !formData.members) {
      alert("Please fill all fields");
      return;
    }
    onCreateGroup(formData.groupName, formData.amount, formData.frequency, formData.members);
    setView("list");
    setFormData({ groupName: "", amount: "", frequency: "monthly", members: "5" });
  };

  const handleJoin = () => {
    if (!formData.groupName) {
      alert("Please enter group name");
      return;
    }
    onJoinGroup(formData.groupName);
    setView("list");
    setFormData({ groupName: "", amount: "", frequency: "monthly", members: "5" });
  };

  if (view === "create") {
    return (
      <div style={styles.esusuContainer}>
        <button onClick={() => setView("list")} style={styles.backButton}>← Back</button>
        <h3 style={styles.esusuTitle}>Create Esusu Group 🤝</h3>
        <p style={styles.esusuSubtitle}>Start a savings group with friends and family</p>
        
        <input
          placeholder="Group name (e.g., Family Circle)"
          value={formData.groupName}
          onChange={(e) => setFormData({...formData, groupName: e.target.value})}
          style={styles.input}
        />
        
        <input
          placeholder="Amount per person (e.g., 5000)"
          type="number"
          value={formData.amount}
          onChange={(e) => setFormData({...formData, amount: e.target.value})}
          style={styles.input}
        />
        
        <select
          value={formData.frequency}
          onChange={(e) => setFormData({...formData, frequency: e.target.value})}
          style={styles.input}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        
        <select
          value={formData.members}
          onChange={(e) => setFormData({...formData, members: e.target.value})}
          style={styles.input}
        >
          <option value="3">3 members</option>
          <option value="4">4 members</option>
          <option value="5">5 members</option>
          <option value="6">6 members</option>
          <option value="8">8 members</option>
          <option value="10">10 members</option>
          <option value="12">12 members</option>
        </select>
        
        <div style={styles.infoBox}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            💡 With {formData.members || "5"} members contributing ₦{formData.amount || "0"} {formData.frequency}, 
            each person will collect ₦{((formData.members || 5) * (formData.amount || 0)).toLocaleString()} when it's their turn!
          </p>
        </div>
        
        <button onClick={handleCreate} style={styles.buttonPrimary}>
          Create Group
        </button>
      </div>
    );
  }

  if (view === "join") {
    return (
      <div style={styles.esusuContainer}>
        <button onClick={() => setView("list")} style={styles.backButton}>← Back</button>
        <h3 style={styles.esusuTitle}>Join Esusu Group 🚪</h3>
        <p style={styles.esusuSubtitle}>Enter the name of the group you want to join</p>
        
        <input
          placeholder="Group name (ask your friend for the exact name)"
          value={formData.groupName}
          onChange={(e) => setFormData({...formData, groupName: e.target.value})}
          style={styles.input}
        />
        
        <button onClick={handleJoin} style={styles.buttonPrimary}>
          Join Group
        </button>
      </div>
    );
  }

  return (
    <div style={styles.esusuContainer}>
      <h3 style={styles.esusuTitle}>My Esusu Groups 🤝</h3>
      <p style={styles.esusuSubtitle}>Save together, collect in turns</p>
      
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setView("create")} style={styles.buttonPrimary}>
          + Create Group
        </button>
        <button onClick={() => setView("join")} style={styles.buttonSecondary}>
          Join Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={{ fontSize: 48, margin: "20px 0" }}>🤝</p>
          <h4 style={{ margin: "10px 0", color: "#94a3b8" }}>No groups yet</h4>
          <p style={{ margin: "10px 0", color: "#64748b", fontSize: 14 }}>
            Create a group or join one to start saving with friends!
          </p>
        </div>
      ) : (
        <div style={styles.groupsList}>
          {groups.map((group, idx) => (
            <div key={idx} style={styles.groupCard}>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: 16 }}>{group.group_name}</h4>
                <p style={{ margin: "4px 0", fontSize: 13, color: "#94a3b8" }}>
                  ₦{group.amount_per_person.toLocaleString()} • {group.frequency}
                </p>
                <p style={{ margin: "4px 0", fontSize: 13, color: "#94a3b8" }}>
                  Your position: #{group.position} of {group.total_members}
                </p>
                <p style={{ margin: "4px 0", fontSize: 13, color: group.has_collected ? "#10b981" : "#f59e0b" }}>
                  {group.has_collected ? "✓ Collected" : "⏳ Waiting for turn"}
                </p>
              </div>
              <button 
                onClick={() => onContribute(group.group_name)}
                style={styles.contributeButton}
              >
                Pay ₦{group.amount_per_person.toLocaleString()}
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={styles.infoBox}>
        <h4 style={{ margin: "0 0 8px 0", fontSize: 14 }}>How Esusu/Ajo Works 💡</h4>
        <p style={{ margin: "4px 0", fontSize: 13, lineHeight: 1.5, color: "#94a3b8" }}>
          Everyone contributes the same amount regularly. Members take turns collecting the full pooled amount. 
          If you're in position 1, you collect first. Position 2 waits for the next round, and so on. 
          It's like getting an interest-free loan from friends! 🎯
        </p>
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
};
