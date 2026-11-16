// Language options and the few chat messages the browser itself shows.
// Everything else SARA says comes translated from the server.

export const LANGUAGE_OPTIONS = [
  { value: "auto", label: "🌐 Auto" },
  { value: "english", label: "English" },
  { value: "pidgin", label: "Pidgin" },
  { value: "yoruba", label: "Yorùbá" },
  { value: "igbo", label: "Igbo" },
  { value: "hausa", label: "Hausa" },
];

export const languageLabel = (value) => LANGUAGE_OPTIONS.find((o) => o.value === value)?.label ?? value;

// The choice on this device, used on the login screen before the account's
// own preference is known. Storage access is guarded (private mode etc.).
const CHOICE_KEY = "sara_language";
export const loadLanguageChoice = () => {
  try {
    const value = localStorage.getItem(CHOICE_KEY);
    return LANGUAGE_OPTIONS.some((o) => o.value === value) ? value : "auto";
  } catch {
    return "auto";
  }
};
export const saveLanguageChoice = (value) => {
  try {
    localStorage.setItem(CHOICE_KEY, value);
  } catch {
    // not fatal
  }
};

// BCP-47 codes for speech recognition and text-to-speech.
// Pidgin has no code of its own; Nigerian English is the closest.
export const SPEECH_CODES = {
  english: "en-NG",
  pidgin: "en-NG",
  yoruba: "yo-NG",
  igbo: "ig-NG",
  hausa: "ha-NG",
};

const strings = {
  thinking: {
    english: "SARA is thinking...",
    pidgin: "SARA dey think...",
    yoruba: "SARA n ronu...",
    igbo: "SARA na-eche echiche...",
    hausa: "SARA tana tunani...",
  },
  genericError: {
    english: "Sorry, something went wrong. Please try again.",
    pidgin: "Sorry, something spoil. Abeg try again.",
    yoruba: "Ma binu, nkan baje. Jowo gbiyanju lekan si.",
    igbo: "Ndo, ihe mebiri. Biko gbalia ozo.",
    hausa: "Yi hakuri, wani abu ya lalace. Don Allah ka sake gwadawa.",
  },
  sessionExpired: {
    english: "Your session has expired. Please log in again.",
    pidgin: "Your session don expire. Abeg login again.",
    yoruba: "Akoko iwole re ti pari. Jowo wole lekan si.",
    igbo: "Oge nbanye gi agwula. Biko banye ozo.",
    hausa: "Lokacin shigar ka ya kare. Don Allah ka sake shiga.",
  },
  voiceUnsupported: {
    english: "Sorry, voice input is not supported in your browser. Try Chrome or Edge!",
    pidgin: "Sorry, voice no dey work for this browser. Try Chrome or Edge!",
    yoruba: "Ma binu, ohun ko sise lori browser yii. Gbiyanju Chrome tabi Edge!",
    igbo: "Ndo, olu anaghi aru oru na browser a. Nwaa Chrome ma o bu Edge!",
    hausa: "Yi hakuri, murya ba ta aiki a wannan browser. Gwada Chrome ko Edge!",
  },
  couldNotHear: {
    english: "I couldn't hear that clearly. Please try again.",
    pidgin: "I no hear am well. Abeg talk again.",
    yoruba: "Mi o gbo daadaa. Jowo tun so.",
    igbo: "Anughi m ya nke oma. Biko kwuo ozo.",
    hausa: "Ban ji sosai ba. Don Allah ka sake fada.",
  },
  voiceLanguageFallback: {
    english: "Voice input isn't available in this language on your browser, so I'm listening in English.",
    pidgin: "Voice no dey for this language for your browser, so I dey listen for English.",
    yoruba: "Ohun ko si fun ede yii lori browser re, nitorina mo n gbo ni English.",
    igbo: "Olu adighi n'asusu a na browser gi, ya mere ana m ege na English.",
    hausa: "Murya ba ta samuwa a wannan harshe a browser ka, don haka ina saurare da English.",
  },
  notAnImage: {
    english: "Please upload an image file.",
    pidgin: "Abeg upload picture file.",
    yoruba: "Jowo gbe faili aworan soke.",
    igbo: "Biko bulite faili foto.",
    hausa: "Don Allah ka loda fayil na hoto.",
  },
  scanFailed: {
    english: "Failed to scan the bill. Please try again.",
    pidgin: "I no fit scan the bill. Abeg try again.",
    yoruba: "Mi o le ka iwe owo naa. Jowo gbiyanju lekan si.",
    igbo: "Enweghi m ike igu akwukwo ugwo ahu. Biko gbalia ozo.",
    hausa: "Ban iya duba takardar ba. Don Allah ka sake gwadawa.",
  },
  switchTo: {
    english: (name) => `Switch to ${name}?`,
    pidgin: (name) => `Change to ${name}?`,
    yoruba: (name) => `Yi pada si ${name}?`,
    igbo: (name) => `Gbanwee gaa ${name}?`,
    hausa: (name) => `Canza zuwa ${name}?`,
  },
  confirmYes: {
    english: "✅ Yes, confirm",
    pidgin: "✅ Yes, do am",
    yoruba: "✅ Beeni",
    igbo: "✅ Ee",
    hausa: "✅ Eh",
  },
  confirmNo: {
    english: "❌ No, cancel",
    pidgin: "❌ No, cancel am",
    yoruba: "❌ Rara",
    igbo: "❌ Mba",
    hausa: "❌ A'a",
  },
};

// ui("switchTo", "yoruba", "Hausa") — falls back to English.
export const ui = (key, language, ...args) => {
  const value = strings[key]?.[language] ?? strings[key]?.english ?? key;
  return typeof value === "function" ? value(...args) : value;
};
