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
  if (!username || !text) return res.status(400).json({ message: "Missing parameters" });

  db.get("SELECT * FROM users WHERE username=?", [username], (err, user) => {
    if (err || !user) return res.status(400).json({ message: "User not found" });

    const lowerText = text.toLowerCase();

    // ------------------------- Check balance -------------------------
    if (/\b(balance|how much|my balance)\b/.test(lowerText)) {
      return res.json({ message: `Your balance: ₦${user.balance}`, balance: user.balance });
    }

    // ------------------------- Airtime purchase -------------------------
    if (/\b(airtime|recharge|top ?up)\b/.test(lowerText)) {
      const match = lowerText.match(/(\d+)/);
      const amount = match ? parseInt(match[0]) : 0;
      if (!amount || amount <= 0) return res.status(400).json({ message: "Invalid airtime amount" });
      if (user.balance < amount) return res.status(400).json({ message: "Insufficient funds" });

      const newBal = user.balance - amount;
      db.run("UPDATE users SET balance=? WHERE username=?", [newBal, username]);

      db.run(
        "INSERT INTO transactions (username,type,amount,to_user,date) VALUES (?,?,?,?,?)",
        [username, "Airtime", amount, "Self", new Date().toISOString()]
      );

      return res.json({ message: `Bought ₦${amount} airtime. New balance: ₦${newBal}`, balance: newBal });
    }

    // ------------------------- Transfer -------------------------
    if (/transfer/.test(lowerText)) {
      const match = lowerText.match(/(\d+)/);
      const amount = match ? parseInt(match[0]) : 0;
      const recipientMatch = lowerText.match(/to (\w+)/);
      const recipient = recipientMatch ? recipientMatch[1] : null;

      if (!recipient) return res.status(400).json({ message: "Specify recipient" });
      if (amount <= 0) return res.status(400).json({ message: "Invalid transfer amount" });
      if (user.balance < amount) return res.status(400).json({ message: "Insufficient funds" });

      db.get("SELECT * FROM users WHERE username=?", [recipient], (err2, recUser) => {
        if (err2 || !recUser) return res.status(400).json({ message: "Recipient not found" });

        const newSenderBal = user.balance - amount;
        const newRecipientBal = recUser.balance + amount;

        db.run("UPDATE users SET balance=? WHERE username=?", [newSenderBal, username]);
        db.run("UPDATE users SET balance=? WHERE username=?", [newRecipientBal, recipient]);

        // Record transaction for both users
        db.run("INSERT INTO transactions (username,type,amount,to_user,date) VALUES (?,?,?,?,?)",
          [username, "Transfer", amount, recipient, new Date().toISOString()]
        );

        db.run("INSERT INTO transactions (username,type,amount,to_user,date) VALUES (?,?,?,?,?)",
          [recipient, "Received", amount, username, new Date().toISOString()]
        );

        return res.json({
          message: `Transferred ₦${amount} to ${recipient}. New balance: ₦${newSenderBal}`,
          balance: newSenderBal
        });
      });

      return;
    }
app.get("/history/:username", (req, res) => {
  const { username } = req.params;
  db.all("SELECT * FROM transactions WHERE username=? ORDER BY date DESC LIMIT 10", [username], (err, rows) => {
    if (err) return res.status(500).json({ message: "Could not fetch history" });
    return res.json({ transactions: rows });
  });
});


    // ------------------------- Unknown action -------------------------
    return res.json({ message: "Action not recognized." });
  });
});

