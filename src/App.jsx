import React, { useState, useEffect } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Basic speech synthesis
  useEffect(() => {
    if (window.speechSynthesis) {
      const utter = new SpeechSynthesisUtterance("Owo is ready to assist you financially!");
      utter.lang = "en-NG";
      window.speechSynthesis.speak(utter);
    }
  }, []);

  // Mock financial backend
  const actions = {
    checkBalance: async () =>
      `Your current balance is ₦${Math.floor(Math.random() * 100000)}.`,
    transfer: async (to, amount) =>
      `✅ Transfer of ₦${amount} to ${to} completed successfully.`,
    buyAirtime: async (amount, network) =>
      `📱 ₦${amount} airtime purchased successfully for ${network}.`,
    transactions: async () => [
      { date: "2025-10-10", type: "debit", amount: 5000, note: "Groceries" },
      { date: "2025-10-11", type: "credit", amount: 10000, note: "Salary" },
    ],
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = { role: "user", text: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      // System prompt for intent detection + multilingual response
      const systemPrompt = `
      You are Owo, a friendly multilingual financial assistant.
      You understand and respond in English, Yoruba, Pidgin, Hausa, or Igbo automatically.
      You can perform: check balance, transfer, buy airtime, and show transaction history.
      If user requests an action, respond naturally and include a JSON like:
      {"intent": "transfer", "to": "John", "amount": 5000}
      Only include JSON if you detect a clear intent.
      `;

      const result = await model.generateContent([
        systemPrompt,
        ...messages.map((m) => `${m.role}: ${m.text}`),
        `user: ${input}`,
      ]);

      const responseText = result.response.text();
      console.log("Gemini raw:", responseText);

      // Try to extract any JSON intent
      let reply = responseText;
      let intent;
      const match = responseText.match(/\{.*\}/s);
      if (match) {
        try {
          intent = JSON.parse(match[0]);
        } catch {}
      }

      // Execute mock action if intent is detected
      if (intent?.intent) {
        switch (intent.intent) {
          case "checkBalance":
            reply = await actions.checkBalance();
            break;
          case "transfer":
            reply = await actions.transfer(intent.to, intent.amount);
            break;
          case "buyAirtime":
            reply = await actions.buyAirtime(intent.amount, intent.network);
            break;
          case "transactions":
            const txs = await actions.transactions();
            reply =
              "🧾 Recent transactions:\n" +
              txs
                .map(
                  (t) =>
                    `${t.date}: ${t.type === "debit" ? "-" : "+"}₦${t.amount} (${t.note})`
                )
                .join("\n");
            break;
        }
      }

      const botMsg = { role: "assistant", text: reply };
      setMessages((prev) => [...prev, botMsg]);

      // Speak reply
      if (window.speechSynthesis) {
        const utter = new SpeechSynthesisUtterance(reply);
        utter.lang = "en-NG";
        window.speechSynthesis.speak(utter);
      }
    } catch (error) {
      console.error("Gemini error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "⚠️ Sorry, I couldn’t process your request." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 p-4">
      <div className="bg-white shadow-lg rounded-2xl w-full max-w-md p-6">
        <h1 className="text-2xl font-semibold mb-4 text-center text-purple-600">
          💬 Owo — Financial Assistant
        </h1>

        <div className="h-96 overflow-y-auto border p-3 rounded-lg mb-4 bg-gray-50">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`my-2 p-2 rounded-lg ${
                m.role === "user"
                  ? "bg-purple-100 text-right"
                  : "bg-green-100 text-left"
              }`}
            >
              {m.text}
            </div>
          ))}
          {isLoading && <p className="text-gray-400">Thinking...</p>}
        </div>

        <div className="flex space-x-2">
          <input
            className="flex-1 border rounded-lg p-2 focus:outline-none"
            value={input}
            placeholder="Type your message..."
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button
            onClick={handleSend}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
