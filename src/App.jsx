import React, { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "firebase/auth";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";

// --- Global variables for API access (automatically provided by environment) ---
const apiKey = "AIzaSyD6mUlXDU77Mbf2MWq7Guu0vl_HJnteOqI";
const GEMINI_MODEL = "gemini-2.5-flash-preview-05-20";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const TTS_VOICE_NAME = "Kore"; // A firm, clear voice for a financial assistant

// Define API URLs using the apiKey variable.
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
const ttsApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${apiKey}`;

// --- Firestore/Auth Global Variables Check ---
const firebaseConfig =
  typeof __firebase_config !== "undefined"
    ? JSON.parse(__firebase_config)
    : null;
const initialAuthToken =
  typeof __initial_auth_token !== "undefined" ? __initial_auth_token : null;
const appId = typeof __app_id !== "undefined" ? __app_id : "default-app-id";
const isApiKeyMissing = apiKey === ""; // Check if the environment key injection failed

// --- Utility Functions for TTS (PCM to WAV conversion) ---

/**
 * Converts a base64 string to an ArrayBuffer.
 * @param {string} base64 - Base64 encoded data.
 * @returns {ArrayBuffer}
 */
const base64ToArrayBuffer = (base64) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Converts raw signed 16-bit PCM data to a standard WAV Blob.
 * @param {Int16Array} pcm16 - The PCM audio data.
 * @param {number} sampleRate - The sample rate, typically 24000 for Gemini TTS.
 * @returns {Blob} - A Blob containing the WAV file.
 */
const pcmToWav = (pcm16, sampleRate) => {
  const numChannels = 1;
  const numSamples = pcm16.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // Helper to write string to DataView
  const writeString = (view, offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF identifier
  writeString(view, 0, "RIFF");
  // File size (36 + data size)
  view.setUint32(4, 36 + numSamples * 2, true);
  // WAVE identifier
  writeString(view, 8, "WAVE");
  // fmt sub-chunk identifier
  writeString(view, 12, "fmt ");
  // fmt sub-chunk size (16 for PCM)
  view.setUint32(16, 16, true);
  // Audio format (1 for PCM)
  view.setUint16(20, 1, true);
  // Number of channels
  view.setUint16(22, numChannels, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate (SampleRate * NumChannels * 2)
  view.setUint32(28, sampleRate * numChannels * 2, true);
  // Block align (NumChannels * 2)
  view.setUint16(32, numChannels * 2, true);
  // Bits per sample (16 bit)
  view.setUint16(34, 16, true);
  // data sub-chunk identifier
  writeString(view, 36, "data");
  // data sub-chunk size (NumSamples * 2)
  view.setUint32(40, numSamples * 2, true);

  // Write the PCM data
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(offset, pcm16[i], true);
    offset += 2;
  }

  return new Blob([view], { type: "audio/wav" });
};

// --- Utility Functions for Simulation and API Calls ---

/**
 * Converts the model's text response into a structured intent object if it's JSON.
 */
const parseIntent = (text) => {
  try {
    const trimmed = text.trim();
    // Check if the trimmed text looks like a JSON object before parsing
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return JSON.parse(trimmed);
    }
  } catch (e) {
    console.warn(
      "Failed to parse response as JSON, treating as conversational text."
    );
  }
  return null;
};

/**
 * Provides localized message templates for transaction responses.
 */
const getLocalizedMessageTemplates = (currentBalance) => {
  const formatBalance = (b) => `NGN ${b.toFixed(2)}`;

  return {
    en: {
      check_balance: `Your current available balance is **${formatBalance(
        currentBalance
      )}**. Thank you for banking with Owo.`,
      transfer_funds: (amount, recipient, newBalance) =>
        `Successfully transferred **${formatBalance(
          amount
        )}** to **${recipient}**. Your new balance is **${formatBalance(
          newBalance
        )}**. Transaction complete.`,
      buy_airtime: (amount, network, newBalance) =>
        `Airtime of **${formatBalance(
          amount
        )}** has been successfully loaded on your phone via **${network}**. Your new balance is **${formatBalance(
          newBalance
        )}**.`,
      error_low_funds:
        "Transaction failed: Insufficient funds in your account for this transaction.",
      error_generic:
        "Transaction failed due to a system error. Please try again.",
    },
    pcm: {
      // Nigerian Pidgin
      check_balance: `Your current money wey dey for your account na **${formatBalance(
        currentBalance
      )}**. Thanks for using Owo.`,
      transfer_funds: (amount, recipient, newBalance) =>
        `Transfer of **${formatBalance(
          amount
        )}** to **${recipient}** don successful. Your new money wey dey now na **${formatBalance(
          newBalance
        )}**. E don land.`,
      buy_airtime: (amount, network, newBalance) =>
        `Airtime of **${formatBalance(
          amount
        )}** don enter your phone for **${network}**. Your new money wey dey now na **${formatBalance(
          newBalance
        )}**.`,
      error_low_funds:
        "Transaction fail: Money no reach for your account to do this transaction.",
      error_generic: "Transaction fail because system get error. Try am again.",
    },
    yo: {
      // Yoruba
      check_balance: `Owo yin to wa ninu account ni **${formatBalance(
        currentBalance
      )}**. Eseun fun lilo Owo.`,
      transfer_funds: (amount, recipient, newBalance) =>
        `A ti fi **${formatBalance(
          amount
        )}** ranse si **${recipient}** ni aseyori. Owo yin titun ni **${formatBalance(
          newBalance
        )}**. Ti pari.`,
      buy_airtime: (amount, network, newBalance) =>
        `Airtime **${formatBalance(
          amount
        )}** ti wole sori foonu yin lati **${network}**. Owo yin titun ni **${formatBalance(
          newBalance
        )}**.`,
      error_low_funds:
        "Isoro waye: Owo ko to ni inu account yin fun isowo yii.",
      error_generic:
        "Isowo naa kuna nitori isoro system. Jowo tun gbiyanju lẹ́ẹ̀kan síi.",
    },
    ig: {
      // Igbo
      check_balance: `Ego gị dị ugbu a na akaụntụ gị bụ **${formatBalance(
        currentBalance
      )}**. I meela maka iji Owo.`,
      transfer_funds: (amount, recipient, newBalance) =>
        `Enyefe ego **${formatBalance(
          amount
        )}** gaa na **${recipient}** agaala nke ọma. Ego gị ọhụrụ bụ **${formatBalance(
          newBalance
        )}**. O mechiela.`,
      buy_airtime: (amount, network, newBalance) =>
        `Airtime **${formatBalance(
          amount
        )}** abanyela n’ekwentị gị site na **${network}**. Ego gị ọhụrụ bụ **${formatBalance(
          newBalance
        )}**.`,
      error_low_funds:
        "Azụmahịa ahụ dara: Ego ezughi oke na akaụntụ gị maka azụmahịa a.",
      error_generic: "Azụmahịa ahụ dara n'ihi nsogbu sistemụ. Biko gbalịa ọzọ.",
    },
    ha: {
      // Hausa
      check_balance: `Kuɗin ku na yanzu a asusun ku shine **${formatBalance(
        currentBalance
      )}**. Nagode da amfani da Owo.`,
      transfer_funds: (amount, recipient, newBalance) =>
        `An yi nasarar tura **${formatBalance(
          amount
        )}** zuwa **${recipient}**. Sabon kuɗin ku shine **${formatBalance(
          newBalance
        )}**. An kammala.`,
      buy_airtime: (amount, network, newBalance) =>
        `An saita iska **${formatBalance(
          amount
        )}** a wayar ku ta **${network}**. Sabon kuɗin ku shine **${formatBalance(
          newBalance
        )}**.`,
      error_low_funds:
        "Kasuwa ta gaza: Ba ku da isasshen kuɗi a cikin asusun ku don wannan kasuwar.",
      error_generic:
        "Kasuwa ta gaza saboda kuskuren tsarin. Da fatan za a sake gwadawa.",
    },
  };
};

/**
 * Fetches content from the Gemini API with exponential backoff for retries.
 * Includes enhanced error logging.
 */
const fetchWithRetry = async (url, options, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        console.error(
          `API Fetch failed on attempt ${i + 1}: Status ${
            response.status
          } for URL ${url}`
        );
        const errorBody = await response.text();
        console.error(
          "API Error Response Body:",
          errorBody.substring(0, 500) + (errorBody.length > 500 ? "..." : "")
        );
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Attempt ${i + 1} failed.`, error);
      if (i === retries - 1) {
        console.error("All retries failed. Throwing final error.");
        throw error;
      }
      const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

const App = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);

  // --- Firestore State ---
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [balance, setBalance] = useState(null); // Dynamic Balance State

  const chatEndRef = useRef(null);
  const audioRef = useRef(null);

  // 1. Firebase Initialization and Authentication
  useEffect(() => {
    if (!firebaseConfig) {
      console.error("Firebase config is missing.");
      return;
    }

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authentication = getAuth(app);

      setDb(firestore);

      const handleAuth = (user) => {
        let currentUserId = user?.uid;

        if (!currentUserId) {
          // This is handled by the initial anonymous/custom sign-in block below
          return;
        }

        setUserId(currentUserId);
        setIsAuthReady(true);
        console.log("Firebase Auth Ready. User ID:", currentUserId);
      };

      const unsubscribeAuth = onAuthStateChanged(authentication, handleAuth);

      // Authentication attempts: Custom Token > Anonymous
      if (initialAuthToken) {
        signInWithCustomToken(authentication, initialAuthToken).catch((e) => {
          console.error(
            "Error signing in with custom token, falling back to anonymous:",
            e
          );
          signInAnonymously(authentication);
        });
      } else {
        signInAnonymously(authentication);
      }

      return () => unsubscribeAuth();
    } catch (error) {
      console.error("Error initializing Firebase:", error);
    }
  }, []);

  // 2. Firestore Balance Listener
  useEffect(() => {
    if (!db || !isAuthReady || !userId) return;

    // Balance document path: /artifacts/{appId}/users/{userId}/financial_data/balance_doc
    const balanceDocRef = doc(
      db,
      "artifacts",
      appId,
      "users",
      userId,
      "financial_data",
      "balance_doc"
    );

    const unsubscribe = onSnapshot(
      balanceDocRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Ensure balance is treated as a number
          setBalance(parseFloat(data.currentBalance) || 0);
        } else {
          // Initialize balance if the document doesn't exist (first run for user)
          const initialBalance = 100000.0; // NGN 100,000.00
          await setDoc(balanceDocRef, {
            currentBalance: initialBalance,
            lastUpdate: new Date().toISOString(),
          })
            .then(() => setBalance(initialBalance))
            .catch((e) => console.error("Error setting initial balance:", e));
        }
      },
      (error) => {
        console.error("Firestore balance snapshot error:", error);
      }
    );

    return () => unsubscribe();
  }, [db, userId, isAuthReady]);

  // Initial welcome message
  useEffect(() => {
    setMessages([
      {
        role: "model",
        text:
          "Hello! I am **Owo**, your multilingual financial assistant. How may I assist you today? (English, Pidgin, Yoruba, Igbo, Hausa)",
        isHtml: true,
      },
    ]);
  }, []);

  // Scroll to the bottom of the chat window
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cleanup for audio object URL
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  /**
   * Calls the Gemini TTS API, converts the PCM result to WAV, and plays the audio.
   */
  const handleTtsSynthesis = useCallback(
    async (text) => {
      if (!text || isApiKeyMissing) return;

      // Strip markdown before sending to TTS for cleaner speech
      const cleanText = text.replace(/\*\*/g, "");

      try {
        const payload = {
          contents: [{ parts: [{ text: cleanText }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: TTS_VOICE_NAME },
              },
            },
          },
        };

        const result = await fetchWithRetry(ttsApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const part = result?.candidates?.[0]?.content?.parts?.[0];
        const audioData = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType;

        if (audioData && mimeType && mimeType.startsWith("audio/")) {
          const match = mimeType.match(/rate=(\d+)/);
          const sampleRate = match ? parseInt(match[1], 10) : 24000;

          const pcmData = base64ToArrayBuffer(audioData);
          const pcm16 = new Int16Array(pcmData);

          const wavBlob = pcmToWav(pcm16, sampleRate);
          const newAudioUrl = URL.createObjectURL(wavBlob);

          // Set and play audio
          setAudioUrl(newAudioUrl);
          if (audioRef.current) {
            audioRef.current.src = newAudioUrl;
            audioRef.current
              .play()
              .catch((e) => console.error("Audio playback failed:", e));
          }
        } else {
          console.warn("TTS did not return valid audio data.");
        }
      } catch (error) {
        console.error("TTS API Error (Check console for details):", error);
      }
    },
    [isApiKeyMissing]
  );

  /**
   * Handles sending the message (text or speech) to the Gemini API and processes transactions.
   */
  const handleSendMessage = useCallback(
    async (speechText = null) => {
      const userMessage = speechText || input.trim();
      if (!userMessage || isLoading) return;

      // Check for Auth and API Key readiness
      if (isApiKeyMissing || !isAuthReady) {
        const errorMsg = isApiKeyMissing
          ? "Authorization is missing. Please check the visible warning banner for details."
          : "Authentication and Data services are still loading. Please wait a moment.";
        setMessages((prev) => [
          ...prev,
          { role: "model", text: errorMsg, isHtml: false },
        ]);
        return;
      }

      const newMessage = { role: "user", text: userMessage };
      if (!speechText) setInput("");

      setMessages((prev) => [...prev, newMessage]);
      setIsLoading(true);

      try {
        const payload = {
          contents: [{ parts: [{ text: userMessage }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
        };

        const result = await fetchWithRetry(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const modelText =
          result.candidates?.[0]?.content?.parts?.[0]?.text ||
          "I'm sorry, I couldn't process that request.";
        const intent = parseIntent(modelText);
        let responseMessage;
        let finalResponseText;
        const messageTemplates = getLocalizedMessageTemplates(balance); // Get templates with current balance

        if (intent && intent.intent) {
          // --- Transaction Intent Detected ---
          const {
            intent: txnIntent,
            details = {},
            language_code = "en",
          } = intent;
          console.log(
            "Processing Transaction Intent:",
            txnIntent,
            details,
            language_code
          );

          const langMessages =
            messageTemplates[language_code] || messageTemplates.en;
          finalResponseText = langMessages.error_generic;

          // Add a system-like message to show the transaction is processing
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              text: `Transaction detected: **${txnIntent}** in **${language_code.toUpperCase()}**. Processing...`,
              isHtml: true,
            },
          ]);

          // --- FireStore Transaction Logic ---
          const balanceDocRef = doc(
            db,
            "artifacts",
            appId,
            "users",
            userId,
            "financial_data",
            "balance_doc"
          );

          if (txnIntent === "transfer_funds" || txnIntent === "buy_airtime") {
            const amount = parseFloat(details.amount) || 0;

            if (balance < amount) {
              // Insufficient funds
              finalResponseText = langMessages.error_low_funds;
            } else {
              // Process successful transaction
              const newBalance = parseFloat((balance - amount).toFixed(2));

              await setDoc(
                balanceDocRef,
                {
                  currentBalance: newBalance,
                  lastUpdate: new Date().toISOString(),
                  lastTransaction: txnIntent,
                  lastAmount: amount,
                },
                { merge: true }
              );

              // Construct success message
              if (txnIntent === "transfer_funds") {
                finalResponseText = langMessages.transfer_funds(
                  amount,
                  details.recipient || "recipient",
                  newBalance
                );
              } else if (txnIntent === "buy_airtime") {
                finalResponseText = langMessages.buy_airtime(
                  amount,
                  details.network || "MTN",
                  newBalance
                );
              }
            }
          } else if (txnIntent === "check_balance") {
            // Just return the current balance message from the templates
            finalResponseText = langMessages.check_balance;
          }

          responseMessage = {
            role: "model",
            text: finalResponseText,
            isHtml: true,
          };
        } else {
          // --- Conversational Response ---
          responseMessage = { role: "model", text: modelText };
          finalResponseText = modelText;
        }

        setMessages((prev) => [...prev, responseMessage]);
        await handleTtsSynthesis(finalResponseText);
      } catch (error) {
        console.error(
          "Gemini API Error or Firestore Transaction Failure:",
          error
        );
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            text:
              "Apologies, I encountered an error connecting to the service or processing the transaction. Please try again.",
          },
        ]);
      } finally {
        setIsLoading(false);
        if (!speechText) setInput("");
      }
    },
    [
      input,
      isLoading,
      isApiKeyMissing,
      isAuthReady,
      balance,
      db,
      userId,
      handleTtsSynthesis,
    ]
  );

  const systemPrompt = `
        You are 'Owo', a friendly, multilingual Nigerian financial assistant. 
        You must respond in the language the user is speaking: English (en), Nigerian Pidgin (pcm), Yoruba (yo), Igbo (ig), or Hausa (ha).

        If the user requests a financial transaction (balance check, transfer, or airtime purchase), you MUST respond ONLY with a JSON object. 
        This JSON object must strictly follow this format:
        { "intent": "transaction_type", "details": { "amount": number, "recipient": string, "network": string }, "language_code": "en" | "pcm" | "yo" | "ig" | "ha" }

        - Use "check_balance" for balance requests. Details fields (amount, recipient, network) are optional.
        - Use "transfer_funds" for transfers. Amount (in Naira) and Recipient (name or account details) are required in the details.
        - Use "buy_airtime" for airtime. Amount (in Naira) and Network (MTN, Glo, Airtel, 9mobile) are required in the details.
        - The 'language_code' must be the code corresponding to the language you detect in the user's message.

        For ALL other conversational questions, respond ONLY with a natural language text response in the user's language. 
        DO NOT include markdown or JSON formatting if the response is conversational text.
        `;

  /**
   * Initializes and starts the browser's Speech Recognition API.
   */
  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error("Speech Recognition not supported in this browser.");
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          text:
            "Voice input is not supported in your browser. Please use the text box.",
          isHtml: false,
        },
      ]);
      setIsListening(false);
      return;
    }

    if (isApiKeyMissing) {
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          text: "Cannot use voice input due to missing API Authorization.",
          isHtml: false,
        },
      ]);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setInput("Listening...");
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
      handleSendMessage(transcript);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      setInput("");
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          text: "Sorry, I missed that. Could you please repeat yourself?",
        },
      ]);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  }, [
    handleSendMessage,
    setInput,
    setMessages,
    setIsListening,
    isApiKeyMissing,
  ]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Helper to render message content, supporting basic markdown/bolding
  const renderMessageContent = (msg) => {
    if (msg.isHtml) {
      return (
        <div
          dangerouslySetInnerHTML={{
            __html: msg.text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"),
          }}
        />
      );
    }
    return msg.text;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 font-sans antialiased">
      <script src="https://cdn.tailwindcss.com"></script>
      <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
                body { font-family: 'Inter', sans-serif; }
                .chat-bubble {
                    max-width: 80%;
                    padding: 0.75rem 1rem;
                    border-radius: 1.25rem;
                    margin-bottom: 0.75rem;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .user-bubble {
                    background-color: #3b82f6; /* blue-500 */
                    color: white;
                    border-bottom-right-radius: 0.25rem;
                    align-self: flex-end;
                }
                .model-bubble {
                    background-color: #e5e7eb; /* gray-200 */
                    color: #1f2937; /* gray-800 */
                    border-bottom-left-radius: 0.25rem;
                    align-self: flex-start;
                }
                .system-bubble {
                    background-color: #fcd34d; /* amber-300 */
                    color: #1f2937;
                    font-size: 0.8rem;
                    padding: 0.25rem 0.5rem;
                    border-radius: 0.75rem;
                    margin-top: 0.5rem;
                    margin-bottom: 0.5rem;
                    align-self: center;
                    text-align: center;
                }
                .input-container {
                    box-shadow: 0 -4px 6px -1px rgba(0,0,0,0.05), 0 -2px 4px -2px rgba(0,0,0,0.05);
                }
                .spinner {
                    border: 4px solid rgba(255, 255, 255, 0.3);
                    border-top: 4px solid #fff;
                    border-radius: 50%;
                    width: 20px;
                    height: 20px;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .mic-active {
                    animation: pulse-ring 1s infinite;
                }
                @keyframes pulse-ring {
                    0% { box-shadow: 0 0 0 0 #ef4444; }
                    80% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
            `}</style>

      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col h-[90vh] sm:h-[85vh] overflow-hidden">
        <header className="p-4 bg-indigo-600 text-white shadow-lg flex flex-col sm:flex-row sm:items-center rounded-t-xl">
          <div className="flex items-center mb-2 sm:mb-0">
            <svg
              className="w-6 h-6 mr-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
              ></path>
            </svg>
            <h1 className="text-xl font-bold">Owo Financial Assistant</h1>
          </div>
          {balance !== null && (
            <div className="bg-indigo-700/70 py-1 px-3 rounded-full text-sm font-semibold sm:ml-auto">
              Balance: NGN {balance.toFixed(2)}
            </div>
          )}
        </header>

        {/* Authorization Warning Banner */}
        {isApiKeyMissing && (
          <div className="bg-red-600 text-white p-2 text-center text-sm font-semibold">
            ⚠️ **API Authorization Missing (Status 403)**: The environment
            failed to provide the necessary API key. Check your platform
            settings.
          </div>
        )}
        {/* Loading/Authentication Status Banner */}
        {!isAuthReady && !isApiKeyMissing && (
          <div className="bg-yellow-500 text-gray-800 p-2 text-center text-sm font-semibold">
            ⌛ Initializing services... Please wait.
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 flex flex-col space-y-3">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${
                msg.role === "user"
                  ? "justify-end"
                  : msg.role === "system"
                  ? "justify-center"
                  : "justify-start"
              }`}
            >
              <div
                className={`chat-bubble ${
                  msg.role === "user"
                    ? "user-bubble"
                    : msg.role === "system"
                    ? "system-bubble"
                    : "model-bubble"
                }`}
              >
                {renderMessageContent(msg)}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="chat-bubble model-bubble">
                <div className="flex items-center space-x-2">
                  <div className="spinner"></div>
                  <span>Owo is thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="input-container p-4 bg-white border-t border-gray-200">
          <div className="flex space-x-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              rows="2"
              placeholder={
                isListening
                  ? "Speak now..."
                  : "Ask for balance, transfer funds, or buy airtime..."
              }
              disabled={
                isLoading ||
                isListening ||
                isApiKeyMissing ||
                !isAuthReady ||
                balance === null
              }
            />

            {/* Microphone Button for Speech-to-Text */}
            <button
              onClick={startSpeechRecognition}
              disabled={
                isLoading || isApiKeyMissing || !isAuthReady || balance === null
              }
              className={`w-12 h-12 rounded-full flex items-center justify-center transition duration-300 shadow-md ${
                isListening
                  ? "bg-red-500 text-white mic-active"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              } disabled:bg-gray-400 disabled:cursor-not-allowed`}
              title="Start Voice Input"
            >
              <svg
                className="w-6 h-6"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4z"
                  clipRule="evenodd"
                ></path>
                <path
                  fillRule="evenodd"
                  d="M4.2 11.086A7.001 7.001 0 0010 18a7.001 7.001 0 005.8-6.914l-.21.03A5 5 0 0110 15a5 5 0 01-4.79-3.873l-.21.03z"
                  clipRule="evenodd"
                ></path>
                <path d="M10 18a7.001 7.001 0 005.8-6.914l-.21.03A5 5 0 0110 15a5 5 0 01-4.79-3.873l-.21.03zM10 20a1 1 0 100-2 1 1 0 000 2z"></path>
              </svg>
            </button>

            {/* Send Button */}
            <button
              onClick={() => handleSendMessage()}
              disabled={
                isLoading ||
                !input.trim() ||
                isListening ||
                isApiKeyMissing ||
                !isAuthReady ||
                balance === null
              }
              className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center transition duration-300 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              title="Send Message"
            >
              {isLoading ? (
                <div className="spinner !border-t-white !border-white/30"></div>
              ) : (
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  ></path>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
      {/* Invisible Audio Player for TTS playback */}
      <audio ref={audioRef} controls={false} />
    </div>
  );
};

export default App;
