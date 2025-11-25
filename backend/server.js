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

// Create esusu groups table
db.run(`CREATE TABLE IF NOT EXISTS esusu_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name TEXT UNIQUE,
  amount_per_person INTEGER,
  frequency TEXT,
  total_members INTEGER,
  created_by TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT
)`);

// Create esusu members table
db.run(`CREATE TABLE IF NOT EXISTS esusu_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER,
  username TEXT,
  position INTEGER,
  has_collected INTEGER DEFAULT 0,
  joined_at TEXT,
  FOREIGN KEY(group_id) REFERENCES esusu_groups(id)
)`);

// Create esusu contributions table
db.run(`CREATE TABLE IF NOT EXISTS esusu_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER,
  username TEXT,
  amount INTEGER,
  cycle_number INTEGER,
  contributed_at TEXT,
  FOREIGN KEY(group_id) REFERENCES esusu_groups(id)
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
        balance: user.balance,
        speak: `Hey ${username}! Your current balance is ${user.balance.toLocaleString()} Naira. Need anything else?`
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
          message: `Perfect! I've topped up ₦${amount.toLocaleString()} airtime for you. Your new balance is ₦${newBal.toLocaleString()}. Enjoy!`, 
          balance: newBal,
          speak: `Perfect! I've topped up ${amount.toLocaleString()} Naira airtime for you. Your new balance is ${newBal.toLocaleString()} Naira. Enjoy!`
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
              message: `All done! ₦${amount.toLocaleString()} has been sent to ${recipient}. Your new balance is ₦${newSenderBal.toLocaleString()}.`,
              balance: newSenderBal,
              speak: `All done! ${amount.toLocaleString()} Naira has been sent to ${recipient}. Your new balance is ${newSenderBal.toLocaleString()} Naira.`
            });
          });
        });
      });
      return;
    }

    // ------------------------- Esusu/Ajo Commands -------------------------
    if (/\b(esusu|ajo|thrift|group saving)\b/.test(lowerText)) {
      // Create esusu group
      if (/\b(create|start|form)\b/.test(lowerText)) {
        return res.json({ 
          message: "To create an esusu group, say something like: 'create esusu group FamilySavings for 5000 monthly with 6 members'",
          speak: "To create an esusu group, say something like: create esusu group Family Savings for 5000 monthly with 6 members"
        });
      }
      
      // General esusu info
      return res.json({ 
        message: "Esusu (also called Ajo) lets you save with friends! Everyone contributes regularly, and each person takes turns collecting the full amount. Want to create a group or join one?",
        speak: "Esusu, also called Ajo, lets you save with friends! Everyone contributes regularly, and each person takes turns collecting the full amount. Want to create a group or join one?"
      });
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

// --------- Esusu/Ajo Features ----------

// Create a new esusu group
app.post("/esusu/create", (req, res) => {
  const { username, groupName, amountPerPerson, frequency, totalMembers } = req.body;
  
  if (!username || !groupName || !amountPerPerson || !frequency || !totalMembers) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (totalMembers < 3 || totalMembers > 12) {
    return res.status(400).json({ 
      message: "Group must have between 3 and 12 members",
      speak: "Group must have between 3 and 12 members"
    });
  }

  db.run(
    "INSERT INTO esusu_groups (group_name, amount_per_person, frequency, total_members, created_by, created_at) VALUES (?,?,?,?,?,?)",
    [groupName, amountPerPerson, frequency, totalMembers, username, new Date().toISOString()],
    function(err) {
      if (err) {
        return res.status(400).json({ 
          message: "A group with this name already exists. Try a different name!",
          speak: "A group with this name already exists. Try a different name!"
        });
      }

      const groupId = this.lastID;
      
      // Add creator as first member
      db.run(
        "INSERT INTO esusu_members (group_id, username, position, joined_at) VALUES (?,?,?,?)",
        [groupId, username, 1, new Date().toISOString()]
      );

      res.json({ 
        message: `Great! Your esusu group "${groupName}" has been created. Share the group name with friends to invite them!`,
        speak: `Great! Your esusu group ${groupName} has been created. Share the group name with friends to invite them!`,
        groupId: groupId
      });
    }
  );
});

// Join an existing esusu group
app.post("/esusu/join", (req, res) => {
  const { username, groupName } = req.body;

  if (!username || !groupName) {
    return res.status(400).json({ message: "Username and group name required" });
  }

  db.get("SELECT * FROM esusu_groups WHERE group_name=?", [groupName], (err, group) => {
    if (err || !group) {
      return res.status(400).json({ 
        message: `I couldn't find a group named "${groupName}". Check the spelling or ask the creator for the exact name.`,
        speak: `I couldn't find a group named ${groupName}. Check the spelling or ask the creator for the exact name.`
      });
    }

    // Check if user already in group
    db.get("SELECT * FROM esusu_members WHERE group_id=? AND username=?", [group.id, username], (err2, existing) => {
      if (existing) {
        return res.status(400).json({ 
          message: "You're already a member of this group!",
          speak: "You're already a member of this group!"
        });
      }

      // Check if group is full
      db.all("SELECT * FROM esusu_members WHERE group_id=?", [group.id], (err3, members) => {
        if (members.length >= group.total_members) {
          return res.status(400).json({ 
            message: "Sorry, this group is full. Try creating a new one!",
            speak: "Sorry, this group is full. Try creating a new one!"
          });
        }

        const position = members.length + 1;
        
        db.run(
          "INSERT INTO esusu_members (group_id, username, position, joined_at) VALUES (?,?,?,?)",
          [group.id, username, position, new Date().toISOString()],
          () => {
            res.json({ 
              message: `Welcome to "${groupName}"! You're member #${position}. You'll collect when it's your turn in position ${position}.`,
              speak: `Welcome to ${groupName}! You're member number ${position}. You'll collect when it's your turn in position ${position}.`
            });
          }
        );
      });
    });
  });
});

// View my esusu groups
app.get("/esusu/my-groups/:username", (req, res) => {
  const { username } = req.params;

  db.all(
    `SELECT g.*, m.position, m.has_collected 
     FROM esusu_groups g 
     JOIN esusu_members m ON g.id = m.group_id 
     WHERE m.username=?`,
    [username],
    (err, groups) => {
      if (err) {
        return res.status(500).json({ message: "Could not fetch groups" });
      }
      res.json({ groups: groups || [] });
    }
  );
});

// Make contribution to esusu
app.post("/esusu/contribute", (req, res) => {
  const { username, groupName } = req.body;

  db.get("SELECT * FROM users WHERE username=?", [username], (err, user) => {
    if (err || !user) {
      return res.status(400).json({ message: "User not found" });
    }

    db.get("SELECT * FROM esusu_groups WHERE group_name=?", [groupName], (err2, group) => {
      if (err2 || !group) {
        return res.status(400).json({ message: "Group not found" });
      }

      // Check if user is member
      db.get("SELECT * FROM esusu_members WHERE group_id=? AND username=?", [group.id, username], (err3, member) => {
        if (!member) {
          return res.status(400).json({ 
            message: "You're not a member of this group!",
            speak: "You're not a member of this group!"
          });
        }

        if (user.balance < group.amount_per_person) {
          return res.status(400).json({ 
            message: `You need ₦${group.amount_per_person.toLocaleString()} but you only have ₦${user.balance.toLocaleString()}.`,
            speak: `You need ${group.amount_per_person.toLocaleString()} Naira but you only have ${user.balance.toLocaleString()} Naira.`
          });
        }

        const newBalance = user.balance - group.amount_per_person;

        db.run("UPDATE users SET balance=? WHERE username=?", [newBalance, username], () => {
          db.run(
            "INSERT INTO esusu_contributions (group_id, username, amount, cycle_number, contributed_at) VALUES (?,?,?,?,?)",
            [group.id, username, 1, group.amount_per_person, new Date().toISOString()]
          );

          db.run(
            "INSERT INTO transactions (username, type, amount, to_user, date) VALUES (?,?,?,?,?)",
            [username, "Esusu Contribution", group.amount_per_person, groupName, new Date().toISOString()]
          );

          res.json({ 
            message: `Perfect! You've contributed ₦${group.amount_per_person.toLocaleString()} to "${groupName}". Your new balance is ₦${newBalance.toLocaleString()}.`,
            speak: `Perfect! You've contributed ${group.amount_per_person.toLocaleString()} Naira to ${groupName}. Your new balance is ${newBalance.toLocaleString()} Naira.`,
            balance: newBalance
          });
        });
      });
    });
  });
});

// Check group status and who's next to collect
app.get("/esusu/status/:groupName", (req, res) => {
  const { groupName } = req.params;

  db.get("SELECT * FROM esusu_groups WHERE group_name=?", [groupName], (err, group) => {
    if (err || !group) {
      return res.status(400).json({ message: "Group not found" });
    }

    db.all(
      `SELECT m.username, m.position, m.has_collected 
       FROM esusu_members m 
       WHERE m.group_id=? 
       ORDER BY m.position`,
      [group.id],
      (err2, members) => {
        db.all(
          "SELECT username, COUNT(*) as count FROM esusu_contributions WHERE group_id=? GROUP BY username",
          [group.id],
          (err3, contributions) => {
            res.json({ 
              group: group,
              members: members || [],
              contributions: contributions || []
            });
          }
        );
      }
    );
  });
});
