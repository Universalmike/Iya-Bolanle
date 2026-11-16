// Shared API client: attaches the login token to every request and
// keeps the session in localStorage so a page refresh doesn't log you out.
import axios from "axios";
import { API_URL } from "./config";

const SESSION_KEY = "sara_session";
export const UNAUTHORIZED_EVENT = "sara:unauthorized";

// Storage can throw (private mode, blocked site data), so every access is guarded.
export const loadSession = () => {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));
    return session?.token && session?.username ? session : null;
  } catch {
    return null;
  }
};

export const saveSession = (session) => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Not fatal: the user just stays logged in only until they refresh.
  }
};

export const clearSession = () => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
};

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const session = loadSession();
  if (session) config.headers.Authorization = `Bearer ${session.token}`;
  return config;
});

// A 401 means the token is missing, expired or invalid: tell the app to log out.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && loadSession()) {
      clearSession();
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: error.response.data?.message }));
    }
    return Promise.reject(error);
  }
);
