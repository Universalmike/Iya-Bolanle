import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database("./data.db");

// Create users table if it doesn't exist
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT,
  balance INTEGER DEFAULT 10000
)`);

const parseIntent = (text) => {
  text = text.toLowerCase();
  if (text.includes("balance")) return "check_balance";
  if (text.includes("airtime") || text.includes("top up")) return "buy_airtime";
  if (text.includes("transfer") || text.includes("send")) return "transfer";
  return "unknown";
};

// --------- Auth ----------
app.post("/signup", (req, res) => {
  const { username, password } = req.body;
  const hashed = bcrypt.hashSync(password, 10);
  db.run("INSERT INTO users(username, password) VALUES(?, ?)", [username, hashed], function(err) {
    if (err) return res.status(400).json({ message: "Signup failed: username exists" });
    res.json({ message: "Signup successful" });
  });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username=?", [username], (err, row) => {
    if (err || !row) return res.status(400).json({ message: "Login failed" });
    if (!bcrypt.compareSync(password, row.password)) return res.status(400).json({ message: "Login failed" });
    res.json({ balance: row.balance });
  });
});

// --------- Action ----------
app.post("/action", (req, res) => {
  const { username, text } = req.body;
  if (!username || !text) return res.status(400).json({ message: "Missing username or text" });

  db.get("SELECT * FROM users WHERE username=?", [username], (err, user) => {
    if (err || !user) return res.status(400).json({ message: "User not found" });

    const intent = parseIntent(text);

    if (intent === "check_balance") {
      return res.json({ balance: user.balance });
    }

    if (intent === "buy_airtime") {
      const match = text.match(/\d+/);
      const amount = match ? parseInt(match[0]) : 0;
      if (amount <= 0) return res.status(400).json({ message: "Invalid airtime amount" });
      if (user.balance < amount) return res.status(400).json({ message: "Insufficient funds" });
      const newBal = user.balance - amount;
      db.run("UPDATE users SET balance=? WHERE username=?", [newBal, username]);
      return res.json({ message: `Purchased ₦${amount} airtime`, balance: newBal });
    }

    if (intent === "transfer") {
      return res.json({ message: "Transfer feature coming soon" });
    }

    return res.json({ message: "Sorry, I didn't understand that" });
  });
});

app.listen(process.env.PORT || 5000, () => console.log("Server running"));
