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

// --------- Check balance ---------
app.get("/balance", (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(400).json({ message: "Username required" });

  db.get("SELECT balance FROM users WHERE username = ?", [username], (err, row) => {
    if (err || !row) return res.status(400).json({ message: "User not found" });
    res.json({ balance: row.balance });
  });
});

// --------- Transfer ---------
app.post("/transfer", (req, res) => {
  const { from, to, amount } = req.body;
  if (!from || !to || !amount) return res.status(400).json({ message: "Missing parameters" });

  db.get("SELECT balance FROM users WHERE username = ?", [from], (err, row) => {
    if (err || !row) return res.status(400).json({ message: "Sender not found" });
    if (row.balance < amount) return res.status(400).json({ message: "Insufficient funds" });

    db.run("UPDATE users SET balance = balance - ? WHERE username = ?", [amount, from]);
    db.run("UPDATE users SET balance = balance + ? WHERE username = ?", [amount, to]);
    res.json({ message: `Transferred ${amount} from ${from} to ${to}` });
  });
});

// --------- Buy airtime ---------
app.post("/buy_airtime", (req, res) => {
  const { username, amount } = req.body;
  if (!username || !amount) return res.status(400).json({ message: "Missing parameters" });

  db.get("SELECT balance FROM users WHERE username = ?", [username], (err, row) => {
    if (err || !row) return res.status(400).json({ message: "User not found" });
    if (row.balance < amount) return res.status(400).json({ message: "Insufficient funds" });

    db.run("UPDATE users SET balance = balance - ? WHERE username = ?", [amount, username]);
    res.json({ message: `Purchased airtime of ${amount}` });
  });
});


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
