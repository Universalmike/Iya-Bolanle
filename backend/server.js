import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import pkg from 'pg';
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');
  }
});

// Create tables
const createTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        balance INTEGER DEFAULT 10000,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        to_user TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS esusu_groups (
        id SERIAL PRIMARY KEY,
        group_name TEXT UNIQUE NOT NULL,
        amount_per_person INTEGER NOT NULL,
        frequency TEXT NOT NULL,
        total_members INTEGER NOT NULL,
        created_by TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS esusu_members (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES esusu_groups(id),
        username TEXT NOT NULL,
        position INTEGER NOT NULL,
        has_collected INTEGER DEFAULT 0,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS esusu_contributions (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES esusu_groups(id),
        username TEXT NOT NULL,
        amount INTEGER NOT NULL,
        cycle_number INTEGER NOT NULL,
        contributed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('All tables created successfully');
  } catch (err) {
    console.error('Error creating tables:', err);
  }
};

createTables();

// --------- Auth ----------
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password required" });
  }
  
  const hashed = bcrypt.hashSync(password, 10);
  
  try {
    await pool.query(
      "INSERT INTO users(username, password) VALUES($1, $2)",
      [username, hashed]
    );
    res.json({ message: "Account created successfully! You can now login." });
  } catch (err) {
    res.status(400).json({ message: "Signup failed: username already exists" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const result = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid username or password" });
    }
    
    const user = result.rows[0];
    
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(400).json({ message: "Invalid username or password" });
    }
    
    res.json({ balance: user.balance, message: "Login successful" });
  } catch (err) {
    res.status(500).json({ message: "Login failed" });
  }
});

// --------- Action ----------
app.post("/action", async (req, res) => {
  const { username, text } = req.body;
  if (!username || !text) return res.status(400).json({ message: "Missing parameters" });

  try {
    const result = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }
    
    const user = result.rows[0];
    const lowerText = text.toLowerCase();

    // Check balance
    if (/\b(balance|how much|my balance)\b/.test(lowerText)) {
      return res.json({ 
        message: `Hey ${username}! Your current balance is ₦${user.balance.toLocaleString()}. Need anything else?`, 
        balance: user.balance,
        speak: `Hey ${username}! Your current balance is ${user.balance.toLocaleString()} Naira. Need anything else?`
      });
    }

    // Airtime purchase
    if (/\b(airtime|recharge|top ?up|buy)\b/.test(lowerText)) {
      const match = lowerText.match(/(\d+)/);
      const amount = match ? parseInt(match[0]) : 0;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ 
          message: "I couldn't figure out the amount. Please say something like 'buy 100 airtime'" 
        });
      }
      
      if (user.balance < amount) {
        return res.status(400).json({ 
          message: `Sorry ${username}, you don't have enough funds. Your balance is ₦${user.balance.toLocaleString()}.` 
        });
      }

      const newBal = user.balance - amount;
      
      await pool.query("UPDATE users SET balance=$1 WHERE username=$2", [newBal, username]);
      await pool.query(
        "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, $2, $3, $4)",
        [username, "Airtime", amount, "Self"]
      );

      return res.json({ 
        message: `Perfect! I've topped up ₦${amount.toLocaleString()} airtime for you. Your new balance is ₦${newBal.toLocaleString()}. Enjoy!`, 
        balance: newBal,
        speak: `Perfect! I've topped up ${amount.toLocaleString()} Naira airtime for you. Your new balance is ${newBal.toLocaleString()} Naira. Enjoy!`
      });
    }

    // Transfer
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
          message: "Please specify an amount." 
        });
      }
      
      if (user.balance < amount) {
        return res.status(400).json({ 
          message: `Oops! You only have ₦${user.balance.toLocaleString()}.` 
        });
      }

      const recResult = await pool.query("SELECT * FROM users WHERE username=$1", [recipient]);
      
      if (recResult.rows.length === 0) {
        return res.status(400).json({ 
          message: `I couldn't find a user named '${recipient}'.` 
        });
      }

      const recUser = recResult.rows[0];
      const newSenderBal = user.balance - amount;
      const newRecipientBal = recUser.balance + amount;

      await pool.query("UPDATE users SET balance=$1 WHERE username=$2", [newSenderBal, username]);
      await pool.query("UPDATE users SET balance=$1 WHERE username=$2", [newRecipientBal, recipient]);
      
      await pool.query(
        "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, $2, $3, $4)",
        [username, "Transfer", amount, recipient]
      );
      
      await pool.query(
        "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, $2, $3, $4)",
        [recipient, "Received", amount, username]
      );

      return res.json({
        message: `All done! ₦${amount.toLocaleString()} has been sent to ${recipient}. Your new balance is ₦${newSenderBal.toLocaleString()}.`,
        balance: newSenderBal,
        speak: `All done! ${amount.toLocaleString()} Naira has been sent to ${recipient}. Your new balance is ${newSenderBal.toLocaleString()} Naira.`
      });
    }

    // Esusu/Ajo Commands
    if (/\b(esusu|ajo|thrift|group saving)\b/.test(lowerText)) {
      if (/\b(create|start|form)\b/.test(lowerText)) {
        return res.json({ 
          message: "To create an esusu group, say something like: 'create esusu group FamilySavings for 5000 monthly with 6 members'",
          speak: "To create an esusu group, say something like: create esusu group Family Savings for 5000 monthly with 6 members"
        });
      }
      
      return res.json({ 
        message: "Esusu (also called Ajo) lets you save with friends! Want to create a group or join one?",
        speak: "Esusu, also called Ajo, lets you save with friends! Want to create a group or join one?"
      });
    }

    return res.json({ 
      message: "I'm not quite sure what you want me to do. Try 'check balance', 'buy airtime', or 'transfer money'." 
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// --------- History ----------
app.get("/history/:username", async (req, res) => {
  const { username } = req.params;
  
  try {
    const result = await pool.query(
      "SELECT * FROM transactions WHERE username=$1 ORDER BY date DESC LIMIT 20",
      [username]
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Could not fetch history" });
  }
});

// --------- Bill Scanner ----------
app.post("/scan-bill", (req, res) => {
  const { username, imageData, billType } = req.body;
  
  if (!username || !imageData) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const mockBillData = {
    electricity: {
      provider: "EKEDC",
      accountNumber: "1234567890",
      customerName: username,
      amount: Math.floor(Math.random() * 5000) + 2000,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      billPeriod: "November 2024",
      meterNumber: "45678901234"
    },
    water: {
      provider: "Lagos Water Corp",
      accountNumber: "WTR" + Math.floor(Math.random() * 1000000),
      customerName: username,
      amount: Math.floor(Math.random() * 3000) + 1000,
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      billPeriod: "November 2024"
    }
  };

  const detectedType = billType || "electricity";
  const billData = mockBillData[detectedType] || mockBillData.electricity;

  res.json({
    success: true,
    billData: billData,
    message: `I've scanned your ${detectedType} bill! Here's what I found.`,
    speak: `I've scanned your ${detectedType} bill! The amount is ${billData.amount} Naira.`
  });
});

app.post("/pay-bill", async (req, res) => {
  const { username, billData } = req.body;

  if (!username || !billData) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }
    
    const user = result.rows[0];
    const amount = billData.amount;

    if (user.balance < amount) {
      return res.status(400).json({
        message: `You need ₦${amount.toLocaleString()} but only have ₦${user.balance.toLocaleString()}.`,
        speak: `You need ${amount.toLocaleString()} Naira but only have ${user.balance.toLocaleString()} Naira.`
      });
    }

    const newBalance = user.balance - amount;

    await pool.query("UPDATE users SET balance=$1 WHERE username=$2", [newBalance, username]);
    await pool.query(
      "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, $2, $3, $4)",
      [username, "Bill Payment", amount, `${billData.provider} - ${billData.accountNumber}`]
    );

    res.json({
      message: `Perfect! Your ${billData.provider} bill of ₦${amount.toLocaleString()} has been paid. New balance: ₦${newBalance.toLocaleString()}.`,
      speak: `Perfect! Your ${billData.provider} bill of ${amount.toLocaleString()} Naira has been paid.`,
      balance: newBalance,
      receiptNumber: "RCP" + Date.now()
    });
  } catch (err) {
    res.status(500).json({ message: "Payment failed" });
  }
});

// --------- Esusu endpoints (simplified for space) ----------
app.post("/esusu/create", async (req, res) => {
  const { username, groupName, amountPerPerson, frequency, totalMembers } = req.body;
  
  try {
    const result = await pool.query(
      "INSERT INTO esusu_groups (group_name, amount_per_person, frequency, total_members, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [groupName, amountPerPerson, frequency, totalMembers, username]
    );
    
    const groupId = result.rows[0].id;
    
    await pool.query(
      "INSERT INTO esusu_members (group_id, username, position) VALUES ($1, $2, $3)",
      [groupId, username, 1]
    );

    res.json({ 
      message: `Great! Your esusu group "${groupName}" has been created.`,
      speak: `Great! Your esusu group ${groupName} has been created.`,
      groupId: groupId
    });
  } catch (err) {
    res.status(400).json({ message: "Group name already exists" });
  }
});

app.get("/esusu/my-groups/:username", async (req, res) => {
  const { username } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT g.*, m.position, m.has_collected 
       FROM esusu_groups g 
       JOIN esusu_members m ON g.id = m.group_id 
       WHERE m.username=$1`,
      [username]
    );
    res.json({ groups: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Could not fetch groups" });
  }
});

// --------- Start Server ----------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 SARA backend running on port ${PORT}`);
});
