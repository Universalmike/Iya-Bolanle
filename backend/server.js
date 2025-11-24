import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database("./data.db");

// Create users table
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT,
  balance INTEGER DEFAULT 10000
)`);

// Create transactions table
db.run(`CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  type TEXT,
  amount INTEGER,
  to_user TEXT,
  date TEXT
)`);

// --------- Auth ----------
app.post("/signup", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password required" });
  }
  
  const hashed = bcrypt.hashSync(password, 10);
  db.run("INSERT INTO users(username, password) VALUES(?, ?)", [username, hashed], function(err) {
    if (err) return res.status(400).json({ message: "Signup failed: username already exists" });
    res.json({ message: "Account created successfully! You can now login." });
  });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username=?", [username], (err, row) => {
    if (err || !row) return res.status(400).json({ message: "Invalid username or password" });
    if (!bcrypt.compareSync(password, row.password)) {
      return res.status(400).json({ message: "Invalid username or password" });
    }
    res.json({ balance: row.balance, message: "Login successful" });
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
      return res.json({ 
        message: `Hey ${username}! Your current balance is ₦${user.balance.toLocaleString()}. Need anything else?`, 
        balance: user.balance 
      });
    }

    // ------------------------- Airtime purchase -------------------------
    if (/\b(airtime|recharge|top ?up|buy)\b/.test(lowerText)) {
      const match = lowerText.match(/(\d+)/);
      const amount = match ? parseInt(match[0]) : 0;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ 
          message: "I couldn't figure out the amount. Please say something like 'buy 100 airtime' or 'recharge 500 naira'" 
        });
      }
      
      if (user.balance < amount) {
        return res.status(400).json({ 
          message: `Sorry ${username}, you don't have enough funds. Your balance is ₦${user.balance.toLocaleString()} but you're trying to buy ₦${amount.toLocaleString()} airtime.` 
        });
      }

      const newBal = user.balance - amount;
      db.run("UPDATE users SET balance=? WHERE username=?", [newBal, username], (updateErr) => {
        if (updateErr) {
          return res.status(500).json({ message: "Transaction failed. Please try again." });
        }

        db.run(
          "INSERT INTO transactions (username, type, amount, to_user, date) VALUES (?,?,?,?,?)",
          [username, "Airtime", amount, "Self", new Date().toISOString()],
          (insertErr) => {
            if (insertErr) console.error("Failed to log transaction:", insertErr);
          }
        );

        return res.json({ 
          message: `Perfect! I've topped up ₦${amount.toLocaleString()} airtime for you. Your new balance is ₦${newBal.toLocaleString()}. Enjoy! 📱`, 
          balance: newBal 
        });
      });
      return;
    }

    // ------------------------- Transfer -------------------------
    if (/\b(transfer|send|pay)\b/.test(lowerText)) {
      const match = lowerText.match(/(\d+)/);
      const amount = match ? parseInt(match[0]) : 0;
      const recipientMatch = lowerText.match(/to (\w+)/);
      const recipient = recipientMatch ? recipientMatch[1] : null;

      if (!recipient) {
        return res.status(400).json({ 
          message: "Who would you like to send money to? Try saying 'transfer 1000 to john'" 
        });
      }
      
      if (amount <= 0) {
        return res.status(400).json({ 
          message: "Please specify an amount. For example: 'send 500 to sarah'" 
        });
      }
      
      if (user.balance < amount) {
        return res.status(400).json({ 
          message: `Oops! You only have ₦${user.balance.toLocaleString()} but you're trying to send ₦${amount.toLocaleString()}.` 
        });
      }

      db.get("SELECT * FROM users WHERE username=?", [recipient], (err2, recUser) => {
        if (err2 || !recUser) {
          return res.status(400).json({ 
            message: `I couldn't find a user named '${recipient}'. Please check the username and try again.` 
          });
        }

        const newSenderBal = user.balance - amount;
        const newRecipientBal = recUser.balance + amount;

        db.run("UPDATE users SET balance=? WHERE username=?", [newSenderBal, username], (updateErr1) => {
          if (updateErr1) {
            return res.status(500).json({ message: "Transfer failed. Please try again." });
          }

          db.run("UPDATE users SET balance=? WHERE username=?", [newRecipientBal, recipient], (updateErr2) => {
            if (updateErr2) {
              // Rollback sender balance
              db.run("UPDATE users SET balance=? WHERE username=?", [user.balance, username]);
              return res.status(500).json({ message: "Transfer failed. Please try again." });
            }

            // Record transaction for sender
            db.run(
              "INSERT INTO transactions (username, type, amount, to_user, date) VALUES (?,?,?,?,?)",
              [username, "Transfer", amount, recipient, new Date().toISOString()]
            );

            // Record transaction for recipient
            db.run(
              "INSERT INTO transactions (username, type, amount, to_user, date) VALUES (?,?,?,?,?)",
              [recipient, "Received", amount, username, new Date().toISOString()]
            );

            return res.json({
              message: `All done! ₦${amount.toLocaleString()} has been sent to ${recipient}. Your new balance is ₦${newSenderBal.toLocaleString()}. 💸`,
              balance: newSenderBal
            });
          });
        });
      });
      return;
    }

    // ------------------------- Unknown action -------------------------
    return res.json({ 
      message: "I'm not quite sure what you want me to do. Try saying things like 'check balance', 'buy 100 airtime', or 'transfer 500 to john'." 
    });
  });
});

// --------- History ----------
app.get("/history/:username", (req, res) => {
  const { username } = req.params;
  db.all(
    "SELECT * FROM transactions WHERE username=? ORDER BY date DESC LIMIT 20", 
    [username], 
    (err, rows) => {
      if (err) {
        console.error("History fetch error:", err);
        return res.status(500).json({ message: "Could not fetch history" });
      }
      return res.json({ transactions: rows || [] });
    }
  );
});

// --------- Start Server ----------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 SARA backend running on port ${PORT}`);
});
