import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";

// 🔹 Helper function to safely get environment variables
const getEnvVar = (key) => import.meta.env[key] || "";

// 🔹 Gemini initialization
const apiKey = getEnvVar("VITE_GEMINI_API_KEY");
let genAI = null;
if (apiKey) {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    console.log("✅ Gemini API initialized");
  } catch (err) {
    console.error("❌ Gemini initialization failed:", err);
  }
} else {
  console.warn("⚠️ VITE_GEMINI_API_KEY missing");
}

// 🔹 Safe Firebase configuration parse
let firebaseConfig = null;
try {
  const firebaseConfigString = getEnvVar("VITE_FIREBASE_CONFIG");
  firebaseConfig = firebaseConfigString ? JSON.parse(firebaseConfigString) : null;
} catch (err) {
  console.error("❌ Invalid Firebase config JSON:", err);
}

let app, db;
if (firebaseConfig) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("✅ Firebase initialized");
  } catch (err) {
    console.error("❌ Firebase initialization failed:", err);
  }
} else {
  console.warn("⚠️ Firebase config missing. Skipping initialization.");
}

const App = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isInputDisabled, setIsInputDisabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);

  // 🔹 Speak AI replies automatically
  useEffect(() => {
    if (messages.length > 0 && window.speechSynthesis) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "ai") {
        const utter = new SpeechSynthesisUtterance(lastMessage.text);
        utter.rate = 1;
        utter.pitch = 1;
        utter.volume = 1;
        window.speechSynthesis.cancel(); // stop any previous speech
        window.speechSynthesis.speak(utter);
      }
    }
  }, [messages]);

  // 🔹 Handle message send
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setIsInputDisabled(true);

    try {
      if (!genAI) throw new Error("Gemini API not initialized");

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Combine conversation history
      const prompt = messages
        .map((msg) => `${msg.role === "user" ? "User" : "AI"}: ${msg.text}`)
        .join("\n") + `\nUser: ${userMessage.text}\nAI:`;

      const result = await model.generateContent(prompt);
      const response = await result.response.text();

      const aiReply = { role: "ai", text: response };
      setMessages((prev) => [...prev, aiReply]);
    } catch (err) {
      console.error("❌ Gemini request failed:", err);
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "Sorry, I couldn’t process that request." },
      ]);
    } finally {
      setIsLoading(false);
      setIsInputDisabled(false);
    }
  };

  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-green-600 text-white py-4 px-6 text-center text-2xl font-bold">
          🌾 Smart AI Assistant
        </div>

        {/* Chat messages */}
        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg ${
                msg.role === "user"
                  ? "bg-green-100 self-end text-right"
                  : "bg-gray-100 text-left"
              }`}
            >
              <span className="block font-semibold">
                {msg.role === "user" ? "You" : "AI"}:
              </span>
              <span>{msg.text}</span>
            </div>
          ))}
          {isLoading && (
            <div className="italic text-gray-500">AI is thinking...</div>
          )}
        </div>

        {/* Input form */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center p-4 border-t border-gray-200 bg-white"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isInputDisabled}
            placeholder="Type your message..."
            className="flex-grow p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            type="submit"
            disabled={isInputDisabled}
            className="ml-2 px-4 py-3 bg-green-600 text-white font-semibold rounded-lg shadow hover:bg-green-700 transition"
          >
            {isLoading ? "..." : "Send"}
          </button>
        </form>

        <audio ref={audioRef} hidden />
      </div>

      {/* Global styling */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; overflow: hidden; }
      `}</style>
    </div>
  );
};

export default App;


