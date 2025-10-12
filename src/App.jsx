import React, { useState, useEffect, useRef, useCallback } from 'react';
// These imports resolve to the Firebase SDK modules installed via NPM/package manager.
import { initializeApp } from 'firebase/app';
import {
    getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged
} from 'firebase/auth';
import {
    getFirestore, doc, setDoc, onSnapshot, collection
} from 'firebase/firestore';

// --- Configuration and API Setup ---
// FIX: Use process.env for broader compatibility across bundler targets.
// NOTE: On Netlify, this variable must be set as GEMINI_API_KEY (without the VITE_ prefix).
const apiKey = process.env.GEMINI_API_KEY || ""; 
const GEMINI_MODEL = "gemini-2.5-flash-preview-05-20";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const TTS_VOICE_NAME = "Kore"; // A firm, clear voice for a financial assistant

// Define API URLs using the apiKey variable.
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
const ttsApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${apiKey}`;

// --- Firestore/Auth Global Variables Check (These still rely on Netlify injection) ---
// Define a standard environment variable name for the Firebase Config.
const FIREBASE_CONFIG_ENV_KEY = 'FIREBASE_CONFIG';

// Prioritize the Canvas global variable, but fall back to a standard environment variable name 
// that doesn't violate deployment platform rules (like starting with a letter).
const firebaseConfigString = 
    typeof __firebase_config !== 'undefined' 
    ? __firebase_config // Priority 1: Canvas global variable (if running in Canvas)
    : process.env[FIREBASE_CONFIG_ENV_KEY]; // Priority 2: Standard environment variable (if running in standard Netlify/Vercel deployment)

const firebaseConfig = firebaseConfigString ? JSON.parse(firebaseConfigString) : null;

// The auth token and app ID are specific to the Canvas environment and must remain as globals.
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-owo-app-id';


/**
 * Converts Base64 string to ArrayBuffer.
 * @param {string} base64 The base64 string
 * @returns {ArrayBuffer}
 */
const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

/**
 * Converts PCM data to a standard WAV format Blob.
 * @param {Int16Array} pcm16 The signed 16-bit PCM data.
 * @param {number} sampleRate The sample rate (e.g., 24000).
 * @returns {Blob}
 */
const pcmToWav = (pcm16, sampleRate) => {
    const numChannels = 1;
    const numSamples = pcm16.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    let offset = 0;

    // Writes a string to the DataView
    const writeString = (str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset++, str.charCodeAt(i));
        }
    };

    // RIFF identifier
    writeString('RIFF');
    view.setUint32(offset, 36 + numSamples * 2, true); offset += 4;
    // file format
    writeString('WAVE'); offset += 4;
    // format chunk identifier
    writeString('fmt '); offset += 4;
    // format chunk length
    view.setUint32(offset, 16, true); offset += 4;
    // sample format (1 = PCM)
    view.setUint16(offset, 1, true); offset += 2;
    // number of channels
    view.setUint16(offset, numChannels, true); offset += 2;
    // sample rate
    view.setUint32(offset, sampleRate, true); offset += 4;
    // byte rate (SampleRate * NumChannels * BitsPerSample/8)
    view.setUint32(offset, sampleRate * numChannels * 2, true); offset += 4;
    // block align (NumChannels * BitsPerSample/8)
    view.setUint16(offset, numChannels * 2, true); offset += 2;
    // bits per sample
    view.setUint16(offset, 16, true); offset += 2;
    // data chunk identifier
    writeString('data'); offset += 4;
    // data chunk length
    view.setUint32(offset, numSamples * 2, true); offset += 4;

    // PCM data
    for (let i = 0; i < pcm16.length; i++) {
        view.setInt16(offset, pcm16[i], true); offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
};

/**
 * Plays audio using the TTS API.
 * @param {string} text The text to convert to speech.
 * @param {HTMLAudioElement} audioRef The audio element reference.
 */
const playTextToSpeech = async (text, audioRef) => {
    if (!apiKey) return console.warn("TTS skipped: API Key is missing.");
    if (!audioRef.current) return;

    try {
        const payload = {
            contents: [{
                parts: [{ text: text }]
            }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: TTS_VOICE_NAME }
                    }
                }
            },
            model: TTS_MODEL
        };

        const response = await fetch(ttsApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error('TTS API error:', response.status, await response.text());
            return;
        }

        const result = await response.json();
        const part = result?.candidates?.[0]?.content?.parts?.[0];
        const audioData = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType;

        if (audioData && mimeType && mimeType.startsWith("audio/L16")) {
            // Extract sample rate from the mimeType (e.g., audio/L16;rate=24000)
            const rateMatch = mimeType.match(/rate=(\d+)/);
            const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;

            const pcmData = base64ToArrayBuffer(audioData);
            const pcm16 = new Int16Array(pcmData);

            const wavBlob = pcmToWav(pcm16, sampleRate);
            const audioUrl = URL.createObjectURL(wavBlob);

            audioRef.current.src = audioUrl;
            audioRef.current.play().catch(e => console.error("Error playing audio:", e));
        } else {
            console.error("TTS response missing audio data or invalid mime type.");
        }

    } catch (e) {
        console.error("TTS fetch failed:", e);
    }
};

/**
 * Utility to fetch with exponential backoff and retry logic.
 * @param {string} url The API URL.
 * @param {object} options Fetch options.
 * @param {number} retries Max number of retries.
 * @returns {Promise<Response>}
 */
const fetchWithRetry = async (url, options, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);

            if (response.ok) {
                return response;
            }

            // Log status for non-OK responses
            console.warn(`API Fetch failed on attempt ${i + 1}: Status ${response.status} for URL ${url}`);

            const errorBody = await response.json();
            console.error("API Error Response Body:", errorBody);

            if (response.status === 403) {
                // If 403, we know the key is missing or invalid, so fail immediately.
                throw new Error("HTTP error! status: 403 (Authentication Failed)");
            }

            throw new Error(`HTTP error! status: ${response.status}`);

        } catch (error) {
            console.error(`Attempt ${i + 1} failed. Error:`, error);
            if (i === retries - 1) {
                // Last attempt failed, throw final error.
                throw new Error("All retries failed. Throwing final error.");
            }
            // Exponential backoff delay
            const delay = Math.pow(2, i) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};


const App = () => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [balance, setBalance] = useState(null); // Managed by Firestore or local fallback
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isDbPersistenceEnabled, setIsDbPersistenceEnabled] = useState(false);
    const messagesEndRef = useRef(null);
    const audioRef = useRef(null);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);

    // --- Utility Functions ---

    // Scrolls to the latest message
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Check API Key Status on Load
    useEffect(() => {
        if (!apiKey) {
            setIsApiKeyMissing(true);
            setMessages((prev) => [
                ...prev,
                { role: 'owo', text: `
                🚫 **Authentication Error (403)** 🚫
                The Gemini API Key is missing. The application will run in **Simulated Mode**.
                Please set the \`GEMINI_API_KEY\` environment variable on Netlify to enable full functionality.
                `}
            ]);
        }
    }, []);


    // --- Firebase Initialization and Auth ---

    useEffect(() => {
        if (!firebaseConfig) {
            console.warn("Firebase config is missing. Running in local fallback mode.");
            setIsDbPersistenceEnabled(false);

            // Unblock UI after a short delay and set local default balance
            const timeout = setTimeout(() => {
                setDb({}); // Set placeholder objects
                setAuth({});
                setUserId(crypto.randomUUID());
                setBalance(100000.00); // Default balance NGN 100,002.00
                setIsAuthReady(true);
            }, 500);

            return () => clearTimeout(timeout);
        }

        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const firebaseAuth = getAuth(app);

            setDb(firestore);
            setAuth(firebaseAuth);
            setIsDbPersistenceEnabled(true);

            const authenticate = async () => {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(firebaseAuth, initialAuthToken);
                        console.info("Signed in with custom token.");
                    } else {
                        await signInAnonymously(firebaseAuth);
                        console.info("Signed in anonymously.");
                    }
                } catch (error) {
                    console.error("Firebase Auth Error:", error);
                    await signInAnonymously(firebaseAuth); // Fallback to anonymous sign-in
                }
            };

            authenticate();

            // Set up Auth State Listener
            const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
                if (user) {
                    setUserId(user.uid);
                    setIsAuthReady(true);
                } else {
                    setUserId(crypto.randomUUID());
                    setIsAuthReady(true);
                }
            });

            return () => unsubscribe(); // Cleanup auth listener

        } catch (error) {
            console.error("Firebase Initialization Error:", error);
            // Fallback for initialization failure
            setDb({});
            setAuth({});
            setUserId(crypto.randomUUID());
            setBalance(100000.00);
            setIsAuthReady(true);
            setIsDbPersistenceEnabled(false);
        }
    }, []);

    // --- Firestore Real-time Balance Listener ---

    useEffect(() => {
        if (!isAuthReady || !db || !userId || !isDbPersistenceEnabled) {
            // If not persistent, don't run Firestore listener
            return;
        }

        const balanceDocRef = doc(db, "artifacts", appId, "users", userId, "financial", "account");

        // Set up the initial balance if it doesn't exist
        const initializeBalance = async () => {
            try {
                await setDoc(balanceDocRef, { balance: 100000.00 }, { merge: true });
                console.info("Initial balance set to NGN 100,000.00.");
            } catch (e) {
                console.error("Error setting initial balance:", e);
            }
        };

        const unsubscribe = onSnapshot(balanceDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const newBalance = docSnap.data().balance;
                setBalance(newBalance);
                console.info("Balance updated from Firestore:", newBalance);
            } else {
                // Document doesn't exist, initialize it.
                initializeBalance();
            }
        }, (error) => {
            console.error("Firestore balance listener error:", error);
        });

        return () => unsubscribe(); // Cleanup listener
    }, [isAuthReady, db, userId, isDbPersistenceEnabled]);


    // --- Voice Recognition (Speech-to-Text) ---

    const startSpeechRecognition = useCallback(() => {
        if (typeof window.webkitSpeechRecognition === 'undefined' && typeof window.SpeechRecognition === 'undefined') {
            setMessages((prev) => [
                ...prev,
                { role: 'system', text: "Your browser does not support Speech Recognition. Please use the keyboard." }
            ]);
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-NG'; // Nigerian English or general English
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            setIsListening(true);
            console.log('Speech recognition started...');
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setInput(transcript);
            recognition.stop();
            // Automatically send the message after a successful transcript
            if (transcript.trim()) {
                // Use the new handleSendMessage that takes an explicit message
                handleSendMessage(transcript.trim()); 
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            setIsListening(false);
            if (event.error !== 'no-speech') {
                 setMessages((prev) => [
                    ...prev,
                    { role: 'system', text: `Voice input error: ${event.error}. Try again.` }
                ]);
            }
        };

        recognition.onend = () => {
            setIsListening(false);
            console.log('Speech recognition ended.');
        };

        recognitionRef.current = recognition;
        recognition.start();

    }, []); // Empty dependency array, but relies on handleSendMessage being stable (see below)

    // --- Message Handling and Gemini API Call ---

    // Define handleSendMessage using useCallback to ensure it has a stable identity,
    // which is needed by startSpeechRecognition.
    const handleSendMessage = useCallback(async (messageText) => {
        if (!messageText.trim() || isLoading) return;

        setInput(''); // Clear input box
        setIsLoading(true);

        const newMessage = { role: 'user', text: messageText };
        const history = [...messages, newMessage];
        setMessages(history);

        if (isApiKeyMissing) {
             setIsLoading(false);
             playTextToSpeech("Apologies, I cannot access the chat service due to a missing API key. Please check the top of the screen for instructions.", audioRef);
             return;
        }

        // System Instruction for Gemini
        const systemInstruction = `You are Owo, a helpful and multilingual financial assistant operating in Nigeria. Your primary goal is to converse with the user in their requested language (English, Nigerian Pidgin, Yoruba, Igbo, Hausa) and execute financial transactions.

        **Language Rules:**
        1.  If the user asks in a Nigerian language (Yoruba: 'kin ni balance mi', Igbo: 'Ego ole ka m nwere', Hausa: 'Nawa ne balance dina'), you MUST respond in that language.
        2.  For general conversation, respond naturally and keep the persona friendly and professional.

        **Transaction Rules:**
        If the user asks for a balance check, a transfer, or airtime purchase, you MUST ONLY output a single, stringified JSON object. DO NOT include any conversational text before or after the JSON.

        The JSON must adhere to this structure:
        {
          "intent": "BALANCE_CHECK" | "TRANSFER" | "AIRTIME_PURCHASE",
          "language_code": "en" | "pcm" | "yo" | "ig" | "ha",
          "details": {
            // Required for TRANSFER and AIRTIME_PURCHASE
            "amount": <number>
            // Required for TRANSFER
            "recipient": <string> (A mock name or account number)
            // Required for AIRTIME_PURCHASE
            "phone_number": <string> (A mock phone number or name)
          }
        }

        **Examples of expected JSON output:**
        - User: 'Mii fe transfer 5000' (Yoruba for 'I want to transfer 5000')
          - JSON Output: {"intent": "TRANSFER", "language_code": "yo", "details": {"amount": 5000, "recipient": "John Doe"}}
        - User: 'Check my balance' (English)
          - JSON Output: {"intent": "BALANCE_CHECK", "language_code": "en", "details": {}}
        - User: 'buy 100 airtime for 08012345678' (English)
          - JSON Output: {"intent": "AIRTIME_PURCHASE", "language_code": "en", "details": {"amount": 100, "phone_number": "08012345678"}}
        
        If the user's intent is NOT a transaction, respond naturally in conversation.
        `;

        // Filter messages to only include 'user' role for prompt
        const conversationHistory = history.map(msg => ({
            role: msg.role === 'owo' ? 'model' : msg.role,
            parts: [{ text: msg.text }]
        }));

        const payload = {
            contents: conversationHistory,
            systemInstruction: {
                parts: [{ text: systemInstruction }]
            },
        };

        try {
            const response = await fetchWithRetry(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "Apologies, I did not receive a valid text response.";

            // Attempt to parse the response as JSON (for transactions)
            let transactionData = null;
            try {
                transactionData = JSON.parse(responseText.trim());
            } catch (e) {
                // Not a JSON object, treat as conversational response
                transactionData = null;
            }

            let owoResponseText = responseText;

            if (transactionData && transactionData.intent) {
                // --- TRANSACTION LOGIC ---
                const { intent, language_code, details } = transactionData;
                const currentBalance = balance;
                let newBalance = currentBalance;
                let success = false;
                let languageKey = language_code || 'en'; // Default to English

                // Transaction Messages keyed by language
                const transactionMessages = {
                    BALANCE_CHECK: {
                        en: (bal) => `Your current balance is **NGN ${bal.toLocaleString('en-NG', { minimumFractionDigits: 2 })}**.`,
                        pcm: (bal) => `Your current balance na **NGN ${bal.toLocaleString('en-NG', { minimumFractionDigits: 2 })}**.`,
                        yo: (bal) => `Owo t’o wa ninu account re lọwọlọwọ jẹ **NGN ${bal.toLocaleString('en-NG', { minimumFractionDigits: 2 })}**.`,
                        ig: (bal) => `Ego dị gị ugbu a bụ **NGN ${bal.toLocaleString('en-NG', { minimumFractionDigits: 2 })}**.`,
                        ha: (bal) => `Kudin ka na yanzu shine **NGN ${bal.toLocaleString('en-NG', { minimumFractionDigits: 2 })}**.`,
                    },
                    TRANSFER_SUCCESS: {
                        en: (amt, rec) => `Successful transfer of **NGN ${amt.toLocaleString('en-NG')}** to ${rec}.`,
                        pcm: (amt, rec) => `Transfer of **NGN ${amt.toLocaleString('en-NG')}** to ${rec} don succeed.`,
                        yo: (amt, rec) => `A ti transfer **NGN ${amt.toLocaleString('en-NG')}** si ${rec} ni aṣeyọri.`,
                        ig: (amt, rec) => `Ego **NGN ${amt.toLocaleString('en-NG')}** agaala ${rec} nke ọma.`,
                        ha: (amt, rec) => `An yi transfer na **NGN ${amt.toLocaleString('en-NG')}** zuwa ${rec} cikin nasara.`,
                    },
                    AIRTIME_SUCCESS: {
                        en: (amt, num) => `Successfully bought **NGN ${amt.toLocaleString('en-NG')}** airtime for ${num}.`,
                        pcm: (amt, num) => `Airtime **NGN ${amt.toLocaleString('en-NG')}** don land for ${num}.`,
                        yo: (amt, num) => `A ti ra airtime **NGN ${amt.toLocaleString('en-NG')}** fun ${num} ni aṣeyọri.`,
                        ig: (amt, num) => `Ego ikuku **NGN ${amt.toLocaleString('en-NG')}** agaala ${num} nke ọma.`,
                        ha: (amt, num) => `An sayi airtime na **NGN ${amt.toLocaleString('en-NG')}** don ${num} cikin nasara.`,
                    },
                    INSUFFICIENT_FUNDS: {
                        en: "Transaction failed. Insufficient funds.",
                        pcm: "Transaction no go. No money reach.",
                        yo: "Iṣẹ́ náà kùnà. Owo kò tó.",
                        ig: "Ego gị ezughị maka azụmahịa a.",
                        ha: "Aiki bai yi nasara ba. Kudin ka bai isa ba.",
                    }
                };

                const languageCodes = { en: 'en', yo: 'yo', ha: 'ha', ig: 'ig', pcm: 'pcm' };
                const selectedLang = languageCodes[languageKey] || 'en';

                switch (intent) {
                    case 'BALANCE_CHECK':
                        owoResponseText = transactionMessages.BALANCE_CHECK[selectedLang](currentBalance);
                        break;

                    case 'TRANSFER':
                    case 'AIRTIME_PURCHASE':
                        const amount = details?.amount || 0;
                        if (currentBalance >= amount) {
                            newBalance = currentBalance - amount;
                            success = true;

                            if (isDbPersistenceEnabled) {
                                // Update Firestore
                                const balanceDocRef = doc(db, "artifacts", appId, "users", userId, "financial", "account");
                                await setDoc(balanceDocRef, { balance: newBalance }, { merge: true });
                            } else {
                                // Update local state for fallback mode
                                setBalance(newBalance);
                            }

                            if (intent === 'TRANSFER') {
                                owoResponseText = transactionMessages.TRANSFER_SUCCESS[selectedLang](amount, details.recipient || 'recipient');
                            } else if (intent === 'AIRTIME_PURCHASE') {
                                owoResponseText = transactionMessages.AIRTIME_SUCCESS[selectedLang](amount, details.phone_number || 'your phone');
                            }
                        } else {
                            owoResponseText = transactionMessages.INSUFFICIENT_FUNDS[selectedLang];
                        }
                        break;

                    default:
                        owoResponseText = responseText; // Fallback to original text if intent is unknown
                }
            }
            // --- END TRANSACTION LOGIC ---

            const finalOwoMessage = { role: 'owo', text: owoResponseText };
            setMessages(prev => [...prev, finalOwoMessage]);

            // TTS only for Owo's response
            playTextToSpeech(owoResponseText.replace(/\*\*/g, ''), audioRef);


        } catch (error) {
            console.error("Gemini API Error (Check console for details):", error);
            const errorMessage = "Apologies, I encountered an error connecting to the service. Please try again.";
            setMessages(prev => [...prev, { role: 'owo', text: errorMessage }]);
            playTextToSpeech(errorMessage, audioRef);

        } finally {
            setIsLoading(false);
        }
    }, [messages, isLoading, balance, isDbPersistenceEnabled, db, userId, isApiKeyMissing]);


    // Define a wrapper for handleSendMessage to handle the form submission case
    const handleSubmit = (e) => {
        e.preventDefault();
        handleSendMessage(input);
    };

    // --- UI Rendering ---

    const formatBalance = (amount) => {
        if (amount === null) return "NGN 0.00";
        return amount.toLocaleString('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    const isInputDisabled = isLoading || isListening || isApiKeyMissing;


    return (
        <div className="flex h-screen antialiased text-gray-800 bg-gray-50">
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
                body {
                    font-family: 'Inter', sans-serif;
                    overflow: hidden; /* Prevent body scroll */
                }
            `}</style>

            <div className="flex flex-col flex-auto h-full p-6 w-full max-w-4xl mx-auto shadow-2xl rounded-xl bg-white">
                
                {/* Header */}
                <header className="flex items-center justify-between p-4 mb-4 border-b border-gray-200">
                    <div className="flex items-center">
                        <span className="text-3xl font-bold text-green-700">Owo</span>
                        <span className="text-3xl text-gray-400 font-light ml-1">Assistant</span>
                    </div>
                    
                    <div className="text-right">
                        <div className="text-xs text-gray-500 font-semibold uppercase">Current Balance</div>
                        <div className="text-2xl font-extrabold text-green-600 rounded-lg bg-green-50 px-3 py-1">
                            {formatBalance(balance)}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                            {isDbPersistenceEnabled ? 'Data Saved' : 'Simulated (Not Saved)'}
                        </div>
                    </div>
                </header>
                
                {/* Authentication Alert Banner */}
                {isApiKeyMissing && (
                    <div className="p-3 mb-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm font-medium">
                        <span className="font-bold">Deployment Error:</span> The Gemini API Key is missing.
                        Please set the **<code className="bg-red-200 text-red-800 p-0.5 rounded">GEMINI_API_KEY</code>** environment variable in your Netlify settings.
                    </div>
                )}
                
                {/* Chat Area */}
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex flex-col flex-auto h-full p-6 overflow-y-auto space-y-4 rounded-lg bg-gray-100">
                        {messages.length === 0 && (
                            <div className="text-center text-gray-500 mt-20">
                                <p className="text-xl mb-2">Hello! I am Owo, your multilingual financial assistant.</p>
                                <p className="text-sm">How may I assist you today? (English, Pidgin, Yoruba, Igbo, Hausa)</p>
                            </div>
                        )}

                        {messages.map((message, index) => (
                            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-xs sm:max-w-md lg:max-w-lg p-3 rounded-xl shadow-md ${
                                    message.role === 'user'
                                        ? 'bg-green-500 text-white rounded-br-none'
                                        : 'bg-white text-gray-800 rounded-tl-none border border-gray-200'
                                }`}>
                                    <p className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: message.text.replace(/\n/g, '<br/>') }} />
                                    {message.role === 'user' && (
                                        <div className="text-xs text-green-200 mt-1 flex justify-end">
                                            {message.role === 'user' ? 'You' : 'Owo'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                </div>
                
                {/* Input and Send Area */}
                <div className="flex flex-col mt-4">
                    <form onSubmit={handleSubmit} className="flex flex-row items-center w-full">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={isListening ? "Listening..." : "Type your request or ask in a local language..."}
                            className="flex-grow p-4 border border-gray-300 rounded-l-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition duration-150 text-base disabled:bg-gray-200"
                            disabled={isInputDisabled}
                        />

                        {/* Microphone Button */}
                        <button
                            type="button"
                            onClick={startSpeechRecognition}
                            className={`p-4 transition duration-150 ${
                                isListening
                                    ? 'bg-red-500 text-white hover:bg-red-600'
                                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            } focus:outline-none`}
                            title={isListening ? "Listening..." : "Start Voice Input"}
                            disabled={isInputDisabled}
                        >
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4z" clipRule="evenodd" />
                                <path fillRule="evenodd" d="M5.5 8.014v-.004c.002-.01.004-.02.007-.03A5 5 0 0110 3a5 5 0 014.505 4.976c.003.01.005.02.007.03v.004c0 1.01.213 1.968.598 2.828l.7.7a.5.5 0 01-.707.707l-.707-.7a5.502 5.502 0 00-1.07-1.353v3.313c0 .276-.224.5-.5.5s-.5-.224-.5-.5V9.75l-1.018 1.018a.5.5 0 01-.707-.707l1.018-1.018V8a.5.5 0 011 0v.014z" clipRule="evenodd" />
                            </svg>
                        </button>
                        
                        {/* Send Button */}
                        <button
                            type="submit"
                            className="p-4 bg-green-600 text-white rounded-r-xl hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition duration-150 disabled:bg-gray-400"
                            title="Send Message"
                            disabled={isInputDisabled}
                        >
                            {isLoading ? (
                                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <svg className="w-6 h-6 transform rotate-90" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 00.183.323l.143.195 2.766 2.074a1 1 0 00.99 0l11-8a1 1 0 00-.788-1.637L10.894 2.553z" />
                                </svg>
                            )}
                        </button>
                    </form>
                </div>
            </div>
            {/* Hidden audio element for TTS playback */}
            <audio ref={audioRef} preload="auto" />
        </div>
    );
};

export default App;
