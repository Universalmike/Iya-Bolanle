import React, { useState, useEffect } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (window.speechSynthesis) {
      const utter = new SpeechSynthesisUtterance("Owo online, wetin I fit do for you?");
      window.speechSynthesis.speak(utter);
    }
  }, []);

  // Simple keyword-based language detector
  const detectLanguage = (text) => {
    const lower = text.toLowerCase();
    if (/[áéíóúàèìòùẹọ]/.test(lower) || lower.includes("mi o") || lower.includes("se")) return "yoruba";
    if (lower.includes("abeg") || lower.includes("wey") || lower.includes("una")) return "pidgin";
    if (lower.includes("kai") || lower.includes("wallahi") || lower.includes("gani")) return "hausa";
    if (lower.includes("biko") || lower.includes("una eme")) return "igbo";
    return "english";
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userLang = detectLanguage(input);
    const newMessage = { role: "user", text: input, lang: userLang };
    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setInput("");

    try {
      const systemPrompt = `
        You are Owo, a multilingual financial assistant.
        You understand and can speak English, Yoruba, Pidgin, Hausa, and Igbo.
        Always reply in the SAME language as the most recent user message.
        Respond naturally and warmly.

        You can perform:
        - Check balance
        - Make transfers
        - Buy airtime
        - Show transaction history

        If you detect a financial intent, include a JSON object like:
        {"intent": "transfer", "to": "Tunde", "amount": 2000}
        Otherwise, just chat casually.
      `;

      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const result = await model.generateContent([
        systemPrompt,
        ...updatedMessages.map((m) => `${m.role}: ${m.text}`),
        `user (${userLang}): ${input}`,
      ]);

      const reply = result.response.text();
      const botMessage = { role: "assistant", text: reply };
      setMessages((prev) => [...prev, botMessage]);

      // Speak reply aloud in detected language
      if (window.speechSynthesis) {
        const utter = new SpeechSynthesisUtterance(reply);
        window.speechSynthesis.speak(utter);
      }

    } catch (err) {
      console.error("❌ Gemini request failed:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Sorry, I couldn’t process that request 😔" },
      ]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-6">
      <h1 className="text-2xl font-bold mb-4">💸 Owo – Your Multilingual Financial Assistant</h1>

      <div className="w-full max-w-lg bg-gray-800 p-4 rounded-lg shadow-lg h-[60vh] overflow-y-auto">
        {messages.map((msg, idx) => (
          <div key={idx} className={`my-2 ${msg.role === "user" ? "text-right" : "text-left"}`}>
            <span
              className={`inline-block p-2 rounded-lg ${
                msg.role === "user" ? "bg-blue-600" : "bg-gray-700"
              }`}
            >
              {msg.text}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 w-full max-w-lg flex">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type your message..."
          className="flex-1 p-3 rounded-l-lg bg-gray-700 text-white outline-none"
        />
        <button
          onClick={handleSend}
          className="bg-blue-600 px-4 py-2 rounded-r-lg hover:bg-blue-700"
        >
          Send
        </button>
      </div>
    </div>
  );
}
