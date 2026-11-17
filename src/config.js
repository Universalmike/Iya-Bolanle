// The backend the app talks to. For local testing, put VITE_API_URL=http://localhost:3001
// in a .env.local file (ignored by git); without it, the deployed backend is used.
export const API_URL = import.meta.env.VITE_API_URL || "https://Iya-Bolanle-backend.onrender.com";
