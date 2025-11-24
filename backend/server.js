import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --------- SQLite setup ---------
const db = new sqlite3.Database("./db.sqlite", (err) => {
  if (err) console.error("DB connection error:", err);
  else console.log("Connected to SQLite DB");
});

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    balance INTEGER DEFAULT 10000
  )
`);

// --------- Signup ---------
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: "Enter all fields" });

  const hashed = await bcrypt.hash(password, 10);
  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashed], function(err) {
    if (err) return res.status(400).json({ message: "Username already exists" });
    return res.json({ message: "Signup successful" });
  });
});

// --------- Login ---------
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: "Enter all fields" });

  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err || !user) return res.status(400).json({ message: "Invalid username or password" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid username or password" });

    return res.json({ message: "Login successful", balance: user.balance });
  });
});

// --------- Simple transaction route (example) ---------
app.get("/transactions", (req, res) => {
  res.json({ message: "This will return transaction history" });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
