// Authentication: JWT issuing/verification, signup validation and a simple
// login rate limiter.
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

const resolveSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    // Fail closed: never run production with a guessable or missing secret.
    throw new Error("JWT_SECRET environment variable must be set in production");
  }
  console.warn("⚠️  JWT_SECRET not set: using a random dev secret (everyone is logged out on restart).");
  return crypto.randomBytes(32).toString("hex");
};

const SECRET = resolveSecret();
const TOKEN_TTL = process.env.JWT_TTL || "7d";
const ALGORITHM = "HS256";

export const signToken = (user) =>
  jwt.sign({ sub: user.username, uid: user.id }, SECRET, { expiresIn: TOKEN_TTL, algorithm: ALGORITHM });

export const verifyToken = (token) => jwt.verify(token, SECRET, { algorithms: [ALGORITHM] });

// Express middleware: requires "Authorization: Bearer <token>" and sets
// req.username / req.userId. Handlers must use these, never a username from the request.
export const requireAuth = (req, res, next) => {
  const [scheme, token] = (req.get("authorization") || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Please log in to continue." });
  }
  try {
    const payload = verifyToken(token);
    req.username = payload.sub;
    req.userId = payload.uid;
    return next();
  } catch {
    return res.status(401).json({ message: "Your session has expired. Please log in again." });
  }
};

// For legacy routes like /history/:username — refuse to show another user's data.
export const requireSameUser = (req, res, next) => {
  if (req.params.username && req.params.username !== req.username) {
    return res.status(403).json({ message: "You can only view your own account." });
  }
  return next();
};

// --------- Signup validation ----------
// Same character set the chat uses to recognise recipients ("send 500 to ada_b").
export const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;
export const MIN_PASSWORD_LENGTH = 6;

export const validateSignup = (username, password) => {
  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    return "Username must be 3-20 characters: letters, numbers, _ or . only.";
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 72) {
    return "Password must be at most 72 characters."; // bcrypt ignores bytes beyond 72
  }
  return null;
};

// --------- Rate limiting (in-memory, per key) ----------
// Good enough for a single instance; use Redis or similar if you scale out.
export const createRateLimiter = ({ max, windowMs }) => {
  const hits = new Map();
  return {
    // Returns seconds to wait if the key is blocked, otherwise 0.
    check(key, now = Date.now()) {
      const entry = hits.get(key);
      if (!entry || now - entry.start >= windowMs) return 0;
      return entry.count >= max ? Math.ceil((entry.start + windowMs - now) / 1000) : 0;
    },
    fail(key, now = Date.now()) {
      const entry = hits.get(key);
      if (!entry || now - entry.start >= windowMs) hits.set(key, { start: now, count: 1 });
      else entry.count += 1;
      if (hits.size > 10_000) {
        for (const [k, e] of hits) if (now - e.start >= windowMs) hits.delete(k);
      }
    },
    reset(key) {
      hits.delete(key);
    },
  };
};
