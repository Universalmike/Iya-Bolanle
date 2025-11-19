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

// ------------------------- FUNCTION CALLING TOOL DECLARATION -------------------------

// Define the function the model can call to execute financial actions
const transactionTool = {
  functionDeclarations: [
    {
      name: "executeFinancialAction",
      description: "Executes a simulated financial action: checking balance, transferring funds, or buying airtime.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "The financial action requested by the user. Must be one of: 'check_balance', 'transfer', 'buy_airtime', or 'show_history'.",
          },
          amount: {
            type: "number",
            description: "The numeric amount of money for the action. Only required for 'transfer' or 'buy_airtime'. Must be a positive integer.",
          },
          recipient: {
            type: "string",
            description: "The name of the recipient for a 'transfer' action (e.g., 'Tunde'). Only required for 'transfer'.",
          },
        },
        required: ["action"],
      },
    },
  ],
};

// ------------------------- Util: Language & Text Helpers -------------------------
const detectLanguage = (text = "") => {
  if (!text) return "english";
  const s = text.toLowerCase();
  if (/\b(abeg|wey|una|omo|na|i go|dey go|wetin|sef)\b/.test(s)) return "pidgin";
  if (/[ṣọạẹọ́àèìòù]/.test(s) || /\b(mi o|kin ni|se|owo|abẹ|gba|bawo)\b/.test(s)) return "yoruba";
  if (/\b(biko|nna|nne|ego|kedu|ime|onye|otu)\b/.test(s) || /ị|ịbụ|ọzọ/.test(s)) return "igbo";
  if (/\b(kai|ina|yaya|sannu|don Allah|wallahi|yola)\b/.test(s)) return "hausa";
  return "english";
};

const stripEmojis = (text) => {
  return text.replace(/(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g, '');
};

// ------------------------- TTS voice picker & helpers -------------------------
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

// ------------------------- Core Action Execution Function (NEW SECURE VERSION) -------------------------

// This function executes the transaction based on the structured data provided by Gemini
const executeToolCall = (userKey, action, amount, recipient, users) => {
    // NOTE: This function no longer calls setUsers directly.
    
    const userData = users[userKey];
    if (!userData) return { error: "User account missing." };
    
    const currentBalance = userData.balance;

    switch (action) {
        case "check_balance":
            return { 
                updates: null, 
                message: `Your current balance is ₦${currentBalance}.` 
            };

        case "transfer": {
            const amt = amount || 0;
            const targetRecipient = recipient || "recipient";
            if (amt <= 0) return { error: "Please specify a valid transfer amount." };
            if (currentBalance < amt) return { error: "Transaction failed: insufficient funds." };
            
            const newBal = currentBalance - amt;
            const tx = { type: "Transfer", amount: amt, to: targetRecipient, date: new Date().toLocaleString() };
            
            return { 
                updates: { balance: newBal, transactions: [...userData.transactions, tx] }, 
                message: `Transfer of ₦${amt} to ${targetRecipient} completed. New balance: ₦${newBal}.` 
            };
        }

        case "buy_airtime": {
            const amt = amount || 0;
            if (amt <= 0) return { error: "Please specify airtime amount." };
            if (currentBalance < amt) return { error: "Transaction failed: insufficient funds." };
            
            const newBal = currentBalance - amt;
            const tx = { type: "Airtime", amount: amt, to: "Self", date: new Date().toLocaleString() };
            
            return { 
                updates: { balance: newBal, transactions: [...userData.transactions, tx] }, 
                message: `Airtime purchase of ₦${amt} successful. New balance: ₦${newBal}.` 
            };
        }

        case "show_history": {
            const slice = (userData.transactions || []).slice(-8).reverse();
            if (!slice.length) return { updates: null, message: "You have no transactions yet." };
            
            const historyText = "📜 Recent transactions:\n" + slice.map(t => 
                `${t.date} — ${t.type} — ₦${t.amount}${t.to ? ` — to ${t.to}` : ""}`
            ).join("\n");
            
            return { updates: null, message: historyText };
        }
        
        default:
            return { error: `Unsupported action: ${action}` };
    }
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
  const lastMsgsRef = useRef(null);

  useEffect(() => {
    ensureVoicesLoaded();
    speakText("Owo ready. Please login to continue.", "english");
  }, []);

  useEffect(() => {
    lastMsgsRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

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

  const startListening = useCallback(() => {
    // ... (Speech recognition logic remains the same)
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

// ------------------------- Core: send message & process (FINAL SECURE VERSION) -------------------------
  const handleSend = async (explicitText) => {
    const text = explicitText !== undefined ? explicitText : input;
    if (!text || !text.trim()) return;
    if (!isLoggedIn) {
      setMessages((prev) => [...prev, { role: "assistant", text: "Please login first.", lang: "english" }]);
      return;
    }

    const userKey = username.trim().toLowerCase();
    const userLang = detectLanguage(text);

    setMessages((prev) => [...prev, { role: "user", text, lang: userLang }]);
    setInput("");
    setIsThinking(true);

    try {
      const systemPrompt = `
You are Owo, a friendly multilingual financial assistant for Nigerian users.
Your goal is to help the user perform financial actions (transfer, check balance, buy airtime) by calling the 'executeFinancialAction' tool.
You understand and respond fluently in the SAME language the user speaks: English, Nigerian Pidgin, Yoruba, Igbo, or Hausa.
If the user's intent is unclear, ask for clarification in their language.
If you call the function, use the result to generate a final, natural, localized response.
`;
      
      const model = getModel("models/gemini-2.5-flash");
      if (!model) return;

      // Build conversation history for the model
      let contents = [{ role: "user", parts: [{ text: text }] }];
      const history = messages.slice(-8).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }]
      }));
      contents = [
          { role: "system", parts: [{ text: systemPrompt }] },
          ...history,
          ...contents
      ];

      // --- STEP 1: Send message with Tool Declaration ---
      let response = await model.generateContent({
          contents: contents,
          config: {
              tools: [{ functionDeclarations: [transactionTool.functionDeclarations[0]] }],
          }
      });

      let finalReply = "Sorry, I couldn't process that request.";
      const candidates = response.candidates || [];
      const candidate = candidates[0];

      // --- Check for Function Call ---
      if (candidate?.functionCalls && candidate.functionCalls.length > 0) {
        
        const toolCall = candidate.functionCalls[0];
        const { action, amount, recipient } = toolCall.args;
        
        // Execute the function (local transaction logic)
        // NOTE: setUsers is NOT passed here, it is handled after the result.
        const toolResult = executeToolCall(userKey, action, amount, recipient, users);
        
        // *** CRITICAL NEW LOGIC: Apply updates only if the function returned them ***
        if (toolResult.updates) {
            const fresh = { ...users, [userKey]: { ...users[userKey], ...toolResult.updates } };
            setUsers(fresh);
            saveAllUsers(fresh);
        }
        
        // --- STEP 2: Send the Tool Result back to the model ---
        
        // Model's turn (The function call itself, using the part returned from API)
        const modelFunctionCallTurn = {
            role: "model",
            parts: candidate.content.parts
        };
        
        // Function's turn (The result from our code, including the message)
        const functionResponseContent = {
            role: "function",
            parts: [{
                functionResponse: {
                    name: toolCall.name,
                    response: { message: toolResult.message || toolResult.error },
                },
            }],
        };
        
        // Assemble the complete history for the final call
        const secondCallContents = [
            ...contents,
            modelFunctionCallTurn,
            functionResponseContent
        ];
        
        // Make the second call to get the final localized, human-friendly response
        response = await model.generateContent({
            contents: secondCallContents,
            config: {
                tools: [{ functionDeclarations: [transactionTool.functionDeclarations[0]] }],
            }
        });
        
        finalReply = response?.text || "Sorry, I received the result but couldn't generate a final reply.";

      } else {
          // No function call was needed (e.g., general question), use the first response text
          finalReply = response?.text || finalReply;
      }

      setMessages((prev) => [...prev, { role: "assistant", text: finalReply, lang: userLang }]);
      await ensureVoicesLoaded();
      speakText(finalReply, userLang);

    } catch (err) {
      console.error("Chat/Function Calling CRITICAL ERROR:", err);
      // The most common error here is the API structure (Cause 2) or network (Cause 1).
      setMessages((prev) => [...prev, { role: "assistant", text: "Sorry, a transaction error occurred. Please check the console for details.", lang: "english" }]);
    } finally {
      setIsThinking(false);
    }
  };

  // ------------------------- Render (Same as before) -------------------------
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
