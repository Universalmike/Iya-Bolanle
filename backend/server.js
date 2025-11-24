import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import sqlite3 from "sqlite3";

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database("./database.sqlite");

// Initialize table if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    balance INTEGER DEFAULT 0
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    type TEXT,
    amount INTEGER,
    recipient TEXT,
    date TEXT
  )
`);

// Root endpoint (optional)
app.get("/", (req, res) => {
  res.send("💰 SARA Backend API is running!");
});

// Signup
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: "Enter all fields" });

  const hashed = await bcrypt.hash(password, 10);

  db.run("INSERT INTO users (username, password, balance) VALUES (?, ?, ?)", [username, hashed, 1000], function(err) {
    if (err) return res.status(400).json({ message: "Username already exists" });
    res.json({ message: "Signup successful", id: this.lastID });
  });
});

// Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: "Enter all fields" });

  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, row) => {
    if (err || !row) return res.status(400).json({ message: "User not found" });

    const match = await bcrypt.compare(password, row.password);
    if (!match) return res.status(400).json({ message: "Incorrect password" });

    res.json({ message: "Login successful", balance: row.balance });
  });
});

// Transactions/actions
app.post("/action", (req, res) => {
  const { username, text } = req.body;
  if (!username || !text) return res.status(400).json({ message: "Missing data" });

  // Example: very simple "check balance"
  if (text.toLowerCase().includes("balance")) {
    db.get("SELECT balance FROM users WHERE username = ?", [username], (err, row) => {
      if (err || !row) return res.status(400).json({ message: "User not found" });
      res.json({ balance: row.balance });
    });
    return;
  }

  res.json({ message: "Action received" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


  const hashed = bcrypt.hashSync(password, 10);

  db.run(
    `INSERT INTO users (username, password) VALUES (?, ?)`,
    [username, hashed],
    function (err) {
      if (err) {
        return res.status(400).json({ message: "Username already exists" });
      }
      res.json({ message: "Signup successful" });
    }
  );
});

// --------------------- LOGIN ------------------------
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    (err, row) => {
      if (!row) {
        return res.status(400).json({ message: "User not found" });
      }

      const match = bcrypt.compareSync(password, row.password);
      if (!match) return res.status(400).json({ message: "Wrong password" });

      res.json({
        message: "Login successful",
        username: row.username,
        balance: row.balance
      });
    }
  );
});

// --------------------- START SERVER ------------------------
app.listen(5000, () => console.log("Server running on port 5000"));
