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

// Gemini API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

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

// --------- Language Detection ----------
const languagePatterns = {
  pidgin: /\b(wetin|dey|abeg|una|abi|no wahala|how far|wan|make we|na so|wahala|oga|sabi|chop)\b/i,
  yoruba: /\b(bawo|ku|pele|dabo|se|owo|mo|ni|ti|ko|wa|daadaa)\b/i,
  igbo: /\b(kedu|ndewo|biko|unu|nna|nwanne|nnoo|bia|gaa|mma|daalu)\b/i,
  hausa: /\b(sannu|yaya|lafiya|gode|sai|barka|kuma|ina|kai|wallahi)\b/i
};

const detectLanguage = (text) => {
  const lowerText = text.toLowerCase();
  for (const [lang, pattern] of Object.entries(languagePatterns)) {
    if (pattern.test(lowerText)) {
      return lang;
    }
  }
  return 'english';
};

// --------- Translations ----------
const translations = {
  balance: {
    english: (name, balance) => `Hey ${name}! Your current balance is ₦${balance.toLocaleString()}. Need anything else?`,
    pidgin: (name, balance) => `My guy ${name}! Your money balance na ₦${balance.toLocaleString()} now. You need anything else?`,
    yoruba: (name, balance) => `E ku ise ${name}! Owo to wa ninu apo re yi je ₦${balance.toLocaleString()}. Se mo le se ohun miiran fun e?`,
    igbo: (name, balance) => `Ndewo ${name}! Ego gi di ugbu a bu ₦${balance.toLocaleString()}. O nwere ihe ozo i choro?`,
    hausa: (name, balance) => `Sannu ${name}! Kudin da kake da shi yanzu shine ₦${balance.toLocaleString()}. Kana bukatar wani abu?`
  },
  airtimeSuccess: {
    english: (amount, newBal) => `Perfect! I've topped up ₦${amount.toLocaleString()} airtime for you. Your new balance is ₦${newBal.toLocaleString()}.`,
    pidgin: (amount, newBal) => `Ehen! I don buy ₦${amount.toLocaleString()} airtime for you. Your new balance na ₦${newBal.toLocaleString()}.`,
    yoruba: (amount, newBal) => `O dara! Mo ti ra ₦${amount.toLocaleString()} airtime fun e. Owo re yi to ku ni ₦${newBal.toLocaleString()}.`,
    igbo: (amount, newBal) => `O di mma! Azutaala m ₦${amount.toLocaleString()} airtime maka gi. Ego gi foduru ugbu a bu ₦${newBal.toLocaleString()}.`,
    hausa: (amount, newBal) => `Na gode! Na saya ₦${amount.toLocaleString()} airtime. Sabon kudin ku shine ₦${newBal.toLocaleString()}.`
  },
  insufficientFunds: {
    english: (balance, amount) => `Sorry, you don't have enough funds. Your balance is ₦${balance.toLocaleString()} but you need ₦${amount.toLocaleString()}.`,
    pidgin: (balance, amount) => `Sorry, your money no reach. You get ₦${balance.toLocaleString()} but you need ₦${amount.toLocaleString()}.`,
    yoruba: (balance, amount) => `Ma binu, owo re ko to. O ni ₦${balance.toLocaleString()} sugbon o nilo ₦${amount.toLocaleString()}.`,
    igbo: (balance, amount) => `Ndo, ego gi erughi. I nwere ₦${balance.toLocaleString()} mana i choro ₦${amount.toLocaleString()}.`,
    hausa: (balance, amount) => `Yi hakuri, kudin ku bai isa ba. Kuna da ₦${balance.toLocaleString()} amma kuna bukatar ₦${amount.toLocaleString()}.`
  },
  transferSuccess: {
    english: (amount, recipient, newBal) => `All done! ₦${amount.toLocaleString()} has been sent to ${recipient}. Your new balance is ₦${newBal.toLocaleString()}.`,
    pidgin: (amount, recipient, newBal) => `E don do! I don send ₦${amount.toLocaleString()} give ${recipient}. Your new balance na ₦${newBal.toLocaleString()}.`,
    yoruba: (amount, recipient, newBal) => `O tan! A ti fi ₦${amount.toLocaleString()} ranise si ${recipient}. Owo re yi to ku ni ₦${newBal.toLocaleString()}.`,
    igbo: (amount, recipient, newBal) => `O gwula! Ezigala m ₦${amount.toLocaleString()} nye ${recipient}. Ego gi foduru ugbu a bu ₦${newBal.toLocaleString()}.`,
    hausa: (amount, recipient, newBal) => `An gama! An aika ₦${amount.toLocaleString()} zuwa ga ${recipient}. Sabon kudin ku shine ₦${newBal.toLocaleString()}.`
  }
};

// --------- Gemini AI Function ----------
async function getGeminiAdvice(userQuery, userContext, language) {
  if (!GEMINI_API_KEY) {
    return "AI advice is not available right now. Please add your Gemini API key.";
  }

  try {
    const languageInstruction = language === 'english' ? '' : 
      `IMPORTANT: Respond in ${language === 'pidgin' ? 'Nigerian Pidgin' : language} language.`;

    const systemPrompt = `You are SARA, a friendly Nigerian financial assistant. ${languageInstruction}

Help with:
- Financial advice and budgeting tips
- Investment suggestions for Nigerians (Treasury bills, mutual funds, stocks)
- Savings strategies
- Nigerian financial products

User context:
${userContext}

Keep responses:
- Brief (2-3 short paragraphs)
- Practical for Nigeria
- Warm and friendly
- Action-oriented`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${systemPrompt}\n\nUser: ${userQuery}`
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 400,
        }
      })
    });

    const data = await response.json();
    
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }
    
    return "I'm having trouble thinking right now. Try again!";
  } catch (error) {
    console.error("Gemini error:", error);
    return "I'm having trouble connecting. Try again!";
  }
}

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
    res.status(400).json({ message: "Username already exists" });
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
    
    res.json({ 
      balance: user.balance, 
      message: "Login successful",
      welcomeMessage: `Hi ${username}! I'm SARA. I speak English, Pidgin, Yoruba, Igbo, and Hausa. I can help with payments, savings, and financial advice!`
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

// --------- Main Action Endpoint ----------
app.post("/action", async (req, res) => {
  const { username, text } = req.body;
  if (!username || !text) {
    return res.status(400).json({ message: "Missing parameters" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }
    
    const user = result.rows[0];
    const detectedLang = detectLanguage(text);
    const lowerText = text.toLowerCase();

    // Check balance
    if (/balance|wetin.*balance|owo.*mi|ego.*m|kudin/i.test(lowerText)) {
      const message = translations.balance[detectedLang](username, user.balance);
      return res.json({ 
        message: message,
        balance: user.balance,
        speak: message.replace(/₦/g, 'Naira '),
        language: detectedLang
      });
    }

    // Buy airtime
    if (/airtime|recharge|top.?up|buy.*airtime/i.test(lowerText)) {
      const match = lowerText.match(/(\d+)/);
      const amount = match ? parseInt(match[0]) : 0;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ 
          message: "Please specify amount. Example: 'buy 100 airtime'"
        });
      }
      
      if (user.balance < amount) {
        const message = translations.insufficientFunds[detectedLang](user.balance, amount);
        return res.status(400).json({ message: message });
      }

      const newBal = user.balance - amount;
      
      await pool.query("UPDATE users SET balance=$1 WHERE username=$2", [newBal, username]);
      await pool.query(
        "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, $2, $3, $4)",
        [username, "Airtime", amount, "Self"]
      );

      const message = translations.airtimeSuccess[detectedLang](amount, newBal);
      return res.json({ 
        message: message,
        balance: newBal,
        speak: message.replace(/₦/g, 'Naira ')
      });
    }

    // Transfer money
    if (/transfer|send|pay|fi.*owo|zigara|tura/i.test(lowerText)) {
      const match = lowerText.match(/(\d+)/);
      const amount = match ? parseInt(match[0]) : 0;
      const recipientMatch = lowerText.match(/to (\w+)|give (\w+)|si (\w+)|nye (\w+)|ga (\w+)/i);
      const recipient = recipientMatch ? (recipientMatch[1] || recipientMatch[2] || recipientMatch[3] || recipientMatch[4] || recipientMatch[5]) : null;

      if (!recipient) {
        return res.status(400).json({ 
          message: "Who do you want to send money to? Example: 'send 1000 to john'"
        });
      }
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ 
          message: "Please specify the amount to send."
        });
      }
      
      if (user.balance < amount) {
        const message = translations.insufficientFunds[detectedLang](user.balance, amount);
        return res.status(400).json({ message: message });
      }

      const recResult = await pool.query("SELECT * FROM users WHERE username=$1", [recipient]);
      
      if (recResult.rows.length === 0) {
        return res.status(400).json({ 
          message: `User '${recipient}' not found. Check the username.`
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

      const message = translations.transferSuccess[detectedLang](amount, recipient, newSenderBal);
      return res.json({
        message: message,
        balance: newSenderBal,
        speak: message.replace(/₦/g, 'Naira ')
      });
    }

    // AI Financial Advice
    if (/advice|tip|invest|save|budget|plan|suggest|recommend|help|guide|what.*should|how.*can/i.test(lowerText) && 
        !/balance|airtime|transfer/i.test(lowerText)) {
      
      const historyResult = await pool.query(
        "SELECT type, amount FROM transactions WHERE username=$1 ORDER BY date DESC LIMIT 5",
        [username]
      );
      
      const userContext = `
Balance: ₦${user.balance.toLocaleString()}
Recent: ${historyResult.rows.map(t => `${t.type} ₦${t.amount}`).join(', ') || 'No transactions'}
      `.trim();

      const aiResponse = await getGeminiAdvice(text, userContext, detectedLang);
      
      return res.json({
        message: aiResponse,
        balance: user.balance,
        speak: aiResponse.substring(0, 250),
        isAiAdvice: true
      });
    }

    // Default response
    return res.json({ 
      message: "I can help with: checking balance, buying airtime, transferring money, or giving financial advice. What do you need?"
    });
    
  } catch (err) {
    console.error("Action error:", err);
    res.status(500).json({ message: "Server error. Please try again." });
  }
});

// --------- Transaction History ----------
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

  const mockBills = {
    electricity: {
      provider: "EKEDC",
      accountNumber: "1234567890",
      customerName: username,
      amount: Math.floor(Math.random() * 5000) + 2000,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      billPeriod: "December 2024",
      meterNumber: "45678901234"
    },
    water: {
      provider: "Lagos Water Corp",
      accountNumber: "WTR" + Math.floor(Math.random() * 1000000),
      customerName: username,
      amount: Math.floor(Math.random() * 3000) + 1000,
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      billPeriod: "December 2024"
    }
  };

  const type = billType || "electricity";
  const billData = mockBills[type] || mockBills.electricity;

  res.json({
    success: true,
    billData: billData,
    message: `I've scanned your ${type} bill! Amount: ₦${billData.amount.toLocaleString()}`,
    speak: `I've scanned your ${type} bill! The amount is ${billData.amount} Naira.`
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
        message: `You need ₦${amount.toLocaleString()} but only have ₦${user.balance.toLocaleString()}.`
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
      balance: newBalance,
      receiptNumber: "RCP" + Date.now()
    });
  } catch (err) {
    res.status(500).json({ message: "Payment failed" });
  }
});

// --------- Esusu Endpoints ----------
app.post("/esusu/create", async (req, res) => {
  const { username, groupName, amountPerPerson, frequency, totalMembers } = req.body;
  
  if (!username || !groupName || !amountPerPerson || !frequency || !totalMembers) {
    return res.status(400).json({ message: "All fields required" });
  }
  
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
      message: `Great! Your esusu group "${groupName}" has been created!`,
      groupId: groupId
    });
  } catch (err) {
    res.status(400).json({ message: "Group name already exists" });
  }
});

app.post("/esusu/join", async (req, res) => {
  const { username, groupName } = req.body;

  try {
    const groupResult = await pool.query("SELECT * FROM esusu_groups WHERE group_name=$1", [groupName]);
    
    if (groupResult.rows.length === 0) {
      return res.status(400).json({ message: `Group "${groupName}" not found.` });
    }

    const group = groupResult.rows[0];

    const existingResult = await pool.query(
      "SELECT * FROM esusu_members WHERE group_id=$1 AND username=$2", 
      [group.id, username]
    );
    
    if (existingResult.rows.length > 0) {
      return res.status(400).json({ message: "You're already in this group!" });
    }

    const membersResult = await pool.query("SELECT * FROM esusu_members WHERE group_id=$1", [group.id]);
    
    if (membersResult.rows.length >= group.total_members) {
      return res.status(400).json({ message: "Sorry, this group is full!" });
    }

    const position = membersResult.rows.length + 1;
    
    await pool.query(
      "INSERT INTO esusu_members (group_id, username, position) VALUES ($1, $2, $3)",
      [group.id, username, position]
    );

    res.json({ 
      message: `Welcome to "${groupName}"! You're member #${position}.`
    });
  } catch (err) {
    res.status(500).json({ message: "Could not join group" });
  }
});

app.post("/esusu/contribute", async (req, res) => {
  const { username, groupName } = req.body;

  try {
    const userResult = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    const groupResult = await pool.query("SELECT * FROM esusu_groups WHERE group_name=$1", [groupName]);
    
    if (userResult.rows.length === 0 || groupResult.rows.length === 0) {
      return res.status(400).json({ message: "User or group not found" });
    }
    
    const user = userResult.rows[0];
    const group = groupResult.rows[0];

    const memberResult = await pool.query(
      "SELECT * FROM esusu_members WHERE group_id=$1 AND username=$2", 
      [group.id, username]
    );
    
    if (memberResult.rows.length === 0) {
      return res.status(400).json({ message: "You're not a member of this group!" });
    }

    if (user.balance < group.amount_per_person) {
      return res.status(400).json({ 
        message: `You need ₦${group.amount_per_person.toLocaleString()} but only have ₦${user.balance.toLocaleString()}.`
      });
    }

    const newBalance = user.balance - group.amount_per_person;

    await pool.query("UPDATE users SET balance=$1 WHERE username=$2", [newBalance, username]);
    
    await pool.query(
      "INSERT INTO esusu_contributions (group_id, username, amount, cycle_number) VALUES ($1, $2, $3, $4)",
      [group.id, username, group.amount_per_person, 1]
    );

    await pool.query(
      "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, $2, $3, $4)",
      [username, "Esusu Contribution", group.amount_per_person, groupName]
    );

    res.json({ 
      message: `Perfect! You've contributed ₦${group.amount_per_person.toLocaleString()} to "${groupName}".`,
      balance: newBalance
    });
  } catch (err) {
    res.status(500).json({ message: "Contribution failed" });
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
