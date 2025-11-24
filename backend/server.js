const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json());

// --------------------- SQLite DB ---------------------
const db = new sqlite3.Database("./database.sqlite");

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    balance INTEGER DEFAULT 10000
  )
`);

// --------------------- SIGN UP ------------------------
app.post("/signup", (req, res) => {
  const { username, password } = req.body;

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
