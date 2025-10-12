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
    if (!input.trim()) return;

    const userLang = detectLanguage(input);
    const newMessage = { role: "user", text: input, lang: userLang };
    setMessages((prev) => [...prev, newMessage]);
    setInput("");

    try {
      const systemPrompt = `
        You are Owo, a friendly, multilingual financial assistant.
        You can speak English, Yoruba, Pidgin, Hausa, and Igbo.
        Always reply in the same language as the user message.

        Your tasks include:
        - Checking balance
        - Making transfers
        - Buying airtime
        - Showing transaction history

        Do NOT show JSON or code blocks.
        Reply like a real human assistant.
        If unsure, ask short, natural questions for clarification.
      `;

      const model = genAI.getGenerativeModel({ model: "models/gemini-2.0-flash" });

      const result = await model.generateContent([
        systemPrompt,
        ...messages.map((m) => `${m.role}: ${m.text}`),
        `user (${userLang}): ${input}`,
      ]);

      const replyText = result.response.text();

      // Detect financial intent with a lightweight heuristic
      let intent = null;
      let amount = null;
      let recipient = null;

      const text = input.toLowerCase();

      if (text.includes("transfer") || text.includes("send")) {
        intent = "transfer";
        const match = text.match(/\d+/);
        amount = match ? parseInt(match[0]) : 0;
        const toMatch = text.match(/to\s+(\w+)/);
        recipient = toMatch ? toMatch[1] : "unknown";
      } else if (text.includes("airtime") || text.includes("recharge")) {
        intent = "buy_airtime";
        const match = text.match(/\d+/);
        amount = match ? parseInt(match[0]) : 0;
      } else if (text.includes("balance")) {
        intent = "check_balance";
      } else if (text.includes("transaction") || text.includes("history")) {
        intent = "show_transaction_history";
      }

      let botReply = replyText;

      if (intent) {
        const simulatedResponse = simulateTransaction(intent, amount, recipient);
        if (simulatedResponse) botReply = simulatedResponse;
      }

      const botMessage = { role: "assistant", text: botReply };
      setMessages((prev) => [...prev, botMessage]);

      if (window.speechSynthesis) {
        const utter = new SpeechSynthesisUtterance(botReply);
        window.speechSynthesis.speak(utter);
      }
    } catch (err) {
      console.error("❌ Gemini request failed:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Sorry, I no fit process that one 😔" },
      ]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-6">
      <h1 className="text-2xl font-bold mb-4">💸 Owo – Multilingual Financial Assistant</h1>

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
