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
    
    res.json({ 
      balance: user.balance, 
      message: "Login successful",
      welcomeMessage: `Hi ${username}! I'm SARA. I speak English, Pidgin, Yoruba, Igbo, and Hausa. Talk to me in any language you're comfortable with! 🎉`
    });
  } catch (err) {
    res.status(500).json({ message: "Login failed" });
  }
});

// --------- Action ----------
app.post("/action", async (req, res) => {
  const { username, text } = req.body;
  if (!username || !text) return res.status(400).json({ message: "Missing parameters" });

  // Detect language from user input
  const detectedLang = detectLanguage(text);
  console.log(`Detected language: ${detectedLang} for text: "${text}"`);

  try {
    const result = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }
    
    const user = result.rows[0];
    const lowerText = text.toLowerCase();

    // Check balance
    if (/\b(balance|how much|my balance|wetin|owo|ego|kuɗi)\b/.test(lowerText)) {
      const message = getTranslation('balance', detectedLang, detectedLang, username, user.balance);
      return res.json({ 
        message: message,
        balance: user.balance,
        speak: message.replace(/₦/g, 'Naira '),
        language: detectedLang
      });
    }

    // Airtime purchase
    if (/\b(airtime|recharge|top ?up|buy|chop|ra|zụta|sayi)\b/.test(lowerText)) {
      const match = lowerText.match(/(\d+)/);
      const amount = match ? parseInt(match[0]) : 0;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ 
          message: detectedLang === 'pidgin' ? "I no understand the amount. Talk like 'buy 100 airtime'" :
                   detectedLang === 'yoruba' ? "Mi ò lóye iye owó náà. Sọ pé 'ra airtime 100'" :
                   detectedLang === 'igbo' ? "Aghọtaghị m ego ahụ. Kwuo 'zụta airtime 100'" :
                   detectedLang === 'hausa' ? "Ban gane adadin ba. Fada 'sayi airtime 100'" :
                   "I couldn't figure out the amount. Please say something like 'buy 100 airtime'"
        });
      }
      
      if (user.balance < amount) {
        const message = getTranslation('airtime', 'insufficient', detectedLang, username, user.balance, amount);
        return res.status(400).json({ 
          message: message,
          speak: message.replace(/₦/g, 'Naira ')
        });
      }

      const newBal = user.balance - amount;
      
      await pool.query("UPDATE users SET balance=$1 WHERE username=$2", [newBal, username]);
      await pool.query(
        "INSERT INTO transactions (username, type, amount, to_user) VALUES ($1, $2, $3, $4)",
        [username, "Airtime", amount, "Self"]
      );

      const message = getTranslation('airtime', 'success', detectedLang, amount, newBal);
      return res.json({ 
        message: message,
        balance: newBal,
        speak: message.replace(/₦/g, 'Naira '),
        language: detectedLang
      });
    }

    // Transfer
    if (/\b(transfer|send|pay|fi|zigara|tura)\b/.test(lowerText)) {
      const match = lowerText.match(/(\d+)/);
      const amount = match ? parseInt(match[0]) : 0;
      const recipientMatch = lowerText.match(/to (\w+)|give (\w+)|sí (\w+)|nye (\w+)|ga (\w+)/);
      const recipient = recipientMatch ? (recipientMatch[1] || recipientMatch[2] || recipientMatch[3] || recipientMatch[4] || recipientMatch[5]) : null;

      if (!recipient) {
        return res.status(400).json({ 
          message: detectedLang === 'pidgin' ? "Who you wan send money give? Talk like 'send 1000 to john'" :
                   detectedLang === 'yoruba' ? "Ta ni o fẹ́ fi owó ránṣẹ́ sí? Sọ pé 'fi 1000 ránṣẹ́ sí john'" :
                   detectedLang === 'igbo' ? "Ònye ka ị ga-ezigara ego? Kwuo 'zigara john 1000'" :
                   detectedLang === 'hausa' ? "Wa zaka tura kuɗi? Fada 'tura 1000 zuwa john'" :
                   "Who would you like to send money to? Try saying 'transfer 1000 to john'"
        });
      }
      
      if (amount <= 0) {
        return res.status(400).json({ 
          message: detectedLang === 'pidgin' ? "Talk the money wey you wan send" :
                   detectedLang === 'yoruba' ? "Sọ iye owó tó fẹ́ fi ránṣẹ́" :
                   detectedLang === 'igbo' ? "Kwuo ego ị chọrọ iziga" :
                   detectedLang === 'hausa' ? "Fada adadin kuɗin da kake so" :
                   "Please specify an amount."
        });
      }
      
      if (user.balance < amount) {
        return res.status(400).json({ 
          message: detectedLang === 'pidgin' ? `Your money no reach. You get ₦${user.balance.toLocaleString()} but you need ₦${amount.toLocaleString()}.` :
                   detectedLang === 'yoruba' ? `Owó rẹ kò tó. O ní ₦${user.balance.toLocaleString()} ṣùgbọ́n o nílò ₦${amount.toLocaleString()}.` :
                   detectedLang === 'igbo' ? `Ego gị erughị. Ị nwere ₦${user.balance.toLocaleString()} mana ị chọrọ ₦${amount.toLocaleString()}.` :
                   detectedLang === 'hausa' ? `Kuɗin ku bai isa ba. Kuna da ₦${user.balance.toLocaleString()} amma kuna buƙatar ₦${amount.toLocaleString()}.` :
                   `Oops! You only have ₦${user.balance.toLocaleString()}.`
        });
      }

      const recResult = await pool.query("SELECT * FROM users WHERE username=$1", [recipient]);
      
      if (recResult.rows.length === 0) {
        const message = getTranslation('transfer', 'userNotFound', detectedLang, recipient);
        return res.status(400).json({ message: message });
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

      const message = getTranslation('transfer', 'success', detectedLang, amount, recipient, newSenderBal);
      return res.json({
        message: message,
        balance: newSenderBal,
        speak: message.replace(/₦/g, 'Naira '),
        language: detectedLang
      });
    }

    // Esusu/Ajo Commands
    if (/\b(esusu|ajo|thrift|group saving)\b/.test(lowerText)) {
      if (/\b(create|start|form)\b/.test(lowerText)) {
        return res.json({ 
          message: detectedLang === 'pidgin' ? "To create esusu group, talk like: 'create esusu group FamilySavings for 5000 monthly with 6 members'" :
                   detectedLang === 'yoruba' ? "Láti dá ẹgbẹ́ esusu, sọ pé: 'create esusu group FamilySavings for 5000 monthly with 6 members'" :
                   detectedLang === 'igbo' ? "Ịmepụta otu esusu, kwuo: 'create esusu group FamilySavings for 5000 monthly with 6 members'" :
                   detectedLang === 'hausa' ? "Don ƙirƙiri ƙungiyar esusu, fada: 'create esusu group FamilySavings for 5000 monthly with 6 members'" :
                   "To create an esusu group, say: 'create esusu group FamilySavings for 5000 monthly with 6 members'",
          speak: "To create an esusu group, say something like: create esusu group Family Savings for 5000 monthly with 6 members"
        });
      }
      
      return res.json({ 
        message: detectedLang === 'pidgin' ? "Esusu (wey dem dey call Ajo) na way to save money with your people! Everybody go dey contribute, and person go collect when e reach im turn. You wan create group or join one?" :
                 detectedLang === 'yoruba' ? "Esusu (tí wọ́n ń pè ní Ajo) jẹ́ ọ̀nà láti pa owó pamọ́ pẹ̀lú àwọn ọ̀rẹ́! Gbogbo èèyàn máa ń da owó sínú, ẹni kọ̀ọ̀kan á sì gba nígbà tí ó bá dé ọjọ́ rẹ̀. Ṣé o fẹ́ dá ẹgbẹ́ tàbí darapọ̀ mọ́ ọ̀kan?" :
                 detectedLang === 'igbo' ? "Esusu (nke a na-akpọ Ajo) bụ ụzọ iji chekwaa ego gị na ndị enyi! Onye ọ bụla ga-enye ego, onye ọ bụ ọ bụla ga-anata mgbe ọ ruru ya. Ị chọrọ ịmepụta otu ma ọ bụ isonye?" :
                 detectedLang === 'hausa' ? "Esusu (wanda ake kira Ajo) hanya ce ta adana kuɗi tare da abokai! Kowa zai bayar da kuɗi, kuma kowa zai karɓi lokacin da ya isa gare shi. Kuna son ƙirƙirar ƙungiya ko shiga ɗaya?" :
                 "Esusu (also called Ajo) lets you save with friends! Everyone contributes regularly, and each person takes turns collecting. Want to create a group or join one?",
        speak: "Esusu, also called Ajo, lets you save with friends! Want to create a group or join one?"
      });
    }

    const errorMessage = translations.error[detectedLang] || translations.error.english;
    return res.json({ 
      message: errorMessage,
      language: detectedLang
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
    },
    internet: {
      provider: "Spectranet",
      accountNumber: "INT" + Math.floor(Math.random() * 1000000),
      customerName: username,
      amount: Math.floor(Math.random() * 15000) + 5000,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      package: "Unlimited 50Mbps"
    },
    cable: {
      provider: "DSTV",
      accountNumber: "DST" + Math.floor(Math.random() * 10000000),
      customerName: username,
      amount: Math.floor(Math.random() * 10000) + 3000,
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      package: "Compact Plus"
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

// --------- Esusu endpoints ----------
// --------- Esusu endpoints ----------
app.post("/esusu/create", async (req, res) => {
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
      message: `Great! Your esusu group "${groupName}" has been created. Share the group name with friends!`,
      speak: `Great! Your esusu group ${groupName} has been created. Share the group name with friends!`,
      groupId: groupId
    });
  } catch (err) {
    res.status(400).json({ message: "Group name already exists or creation failed" });
  }
});

app.post("/esusu/join", async (req, res) => {
  const { username, groupName } = req.body;

  if (!username || !groupName) {
    return res.status(400).json({ message: "Username and group name required" });
  }

  try {
    const groupResult = await pool.query("SELECT * FROM esusu_groups WHERE group_name=$1", [groupName]);
    
    if (groupResult.rows.length === 0) {
      return res.status(400).json({ 
        message: `I couldn't find a group named "${groupName}". Check the spelling.`,
        speak: `I couldn't find a group named ${groupName}. Check the spelling.`
      });
    }

    const group = groupResult.rows[0];

    const existingResult = await pool.query("SELECT * FROM esusu_members WHERE group_id=$1 AND username=$2", [group.id, username]);
    
    if (existingResult.rows.length > 0) {
      return res.status(400).json({ 
        message: "You're already a member of this group!",
        speak: "You're already a member of this group!"
      });
    }

    const membersResult = await pool.query("SELECT * FROM esusu_members WHERE group_id=$1", [group.id]);
    
    if (membersResult.rows.length >= group.total_members) {
      return res.status(400).json({ 
        message: "Sorry, this group is full!",
        speak: "Sorry, this group is full!"
      });
    }

    const position = membersResult.rows.length + 1;
    
    await pool.query(
      "INSERT INTO esusu_members (group_id, username, position) VALUES ($1, $2, $3)",
      [group.id, username, position]
    );

    res.json({ 
      message: `Welcome to "${groupName}"! You're member #${position}.`,
      speak: `Welcome to ${groupName}! You're member number ${position}.`
    });
  } catch (err) {
    res.status(500).json({ message: "Could not join group" });
  }
});

app.post("/esusu/contribute", async (req, res) => {
  const { username, groupName } = req.body;

  try {
    const userResult = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    
    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }
    
    const user = userResult.rows[0];

    const groupResult = await pool.query("SELECT * FROM esusu_groups WHERE group_name=$1", [groupName]);
    
    if (groupResult.rows.length === 0) {
      return res.status(400).json({ message: "Group not found" });
    }
    
    const group = groupResult.rows[0];

    const memberResult = await pool.query("SELECT * FROM esusu_members WHERE group_id=$1 AND username=$2", [group.id, username]);
    
    if (memberResult.rows.length === 0) {
      return res.status(400).json({ 
        message: "You're not a member of this group!",
        speak: "You're not a member of this group!"
      });
    }

    if (user.balance < group.amount_per_person) {
      return res.status(400).json({ 
        message: `You need ₦${group.amount_per_person.toLocaleString()} but only have ₦${user.balance.toLocaleString()}.`,
        speak: `You need ${group.amount_per_person.toLocaleString()} Naira but only have ${user.balance.toLocaleString()} Naira.`
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
      message: `Perfect! You've contributed ₦${group.amount_per_person.toLocaleString()} to "${groupName}". New balance: ₦${newBalance.toLocaleString()}.`,
      speak: `Perfect! You've contributed ${group.amount_per_person.toLocaleString()} Naira to ${groupName}. New balance: ${newBalance.toLocaleString()} Naira.`,
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

app.get("/esusu/status/:groupName", async (req, res) => {
  const { groupName } = req.params;

  try {
    const groupResult = await pool.query("SELECT * FROM esusu_groups WHERE group_name=$1", [groupName]);
    
    if (groupResult.rows.length === 0) {
      return res.status(400).json({ message: "Group not found" });
    }
    
    const group = groupResult.rows[0];

    const membersResult = await pool.query(
      `SELECT m.username, m.position, m.has_collected 
       FROM esusu_members m 
       WHERE m.group_id=$1 
       ORDER BY m.position`,
      [group.id]
    );
    
    const contribResult = await pool.query(
      "SELECT username, COUNT(*) as count FROM esusu_contributions WHERE group_id=$1 GROUP BY username",
      [group.id]
    );

    res.json({ 
      group: group,
      members: membersResult.rows,
      contributions: contribResult.rows
    });
  } catch (err) {
    res.status(500).json({ message: "Could not fetch group status" });
  }
});

// --------- Start Server ----------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 SARA backend running on port ${PORT}`);
});

// --------- Language Detection & Translation System ----------

const languagePatterns = {
  pidgin: /\b(wetin|dey|abeg|una|abi|no wahala|how far|I wan|make we|na so|wahala|kia-kia|oga|sabi|chop|belle)\b/i,
  yoruba: /\b(bawo|ẹ ku|e ku|pele|o dabo|se|owo|mo|ni|ti|ko|wa|daadaa|ẹ se|e se)\b/i,
  igbo: /\b(kedu|ndewo|biko|unu|nna|nwanne|nnoo|bia|gaa|adighi|mma|daalụ|i meela)\b/i,
  hausa: /\b(sannu|yaya|lafiya|na gode|sai|barka|kuma|ina|kai|ke|dan|yar|wallahi)\b/i
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

const translations = {
  greetings: {
    english: {
      welcome: (name) => `Hi ${name}! I'm SARA, your personal financial assistant.`,
      howCanHelp: "How can I help you today?"
    },
    pidgin: {
      welcome: (name) => `Hello ${name}! I be SARA, your personal money helper.`,
      howCanHelp: "Wetin I fit do for you today?"
    },
    yoruba: {
      welcome: (name) => `Ẹ ku àárọ̀ ${name}! Orúkọ mi ni SARA, alábòójútó owó rẹ.`,
      howCanHelp: "Kí ni mo lè ṣe fún ẹ lónìí?"
    },
    igbo: {
      welcome: (name) => `Ndewo ${name}! Aha m bụ SARA, onye na-elekọta ego gị.`,
      howCanHelp: "Kedu ihe m nwere ike imere gị taa?"
    },
    hausa: {
      welcome: (name) => `Sannu ${name}! Sunana SARA, mai kula da kuɗin ku.`,
      howCanHelp: "Menene zan iya yi muku yau?"
    }
  },
  
  balance: {
    english: (name, balance) => `Hey ${name}! Your current balance is ₦${balance.toLocaleString()}. Need anything else?`,
    pidgin: (name, balance) => `My guy ${name}! Your money balance na ₦${balance.toLocaleString()} now. You need anything else?`,
    yoruba: (name, balance) => `Ẹ ku iṣẹ́ ${name}! Owó tó wà nínú àpò rẹ yi jẹ́ ₦${balance.toLocaleString()}. Ṣé mo lè ṣe ohun mìíràn fún ẹ?`,
    igbo: (name, balance) => `Ndewo ${name}! Ego gị dị ugbu a bụ ₦${balance.toLocaleString()}. Ọ nwere ihe ọzọ ị chọrọ?`,
    hausa: (name, balance) => `Sannu ${name}! Kuɗin da kake da shi yanzu shine ₦${balance.toLocaleString()}. Kana buƙatar wani abu?`
  },
  
  airtime: {
    success: {
      english: (amount, newBal) => `Perfect! I've topped up ₦${amount.toLocaleString()} airtime for you. Your new balance is ₦${newBal.toLocaleString()}. Enjoy!`,
      pidgin: (amount, newBal) => `Ehen! I don buy ₦${amount.toLocaleString()} airtime for you. Your new balance na ₦${newBal.toLocaleString()}. Enjoy am!`,
      yoruba: (amount, newBal) => `Ó dára! Mo ti ra ₦${amount.toLocaleString()} airtime fún ẹ. Owó rẹ yi tó kù ni ₦${newBal.toLocaleString()}. Ẹ gbádùn rẹ!`,
      igbo: (amount, newBal) => `Ọ dị mma! Azụtaala m ₦${amount.toLocaleString()} airtime maka gị. Ego gị fọdụrụ ugbu a bụ ₦${newBal.toLocaleString()}. Nwee anụrị!`,
      hausa: (amount, newBal) => `Na gode! Na saya ₦${amount.toLocaleString()} airtime a gare ku. Sabon kuɗin ku shine ₦${newBal.toLocaleString()}. Ku ji dadi!`
    },
    insufficient: {
      english: (name, balance, amount) => `Sorry ${name}, you don't have enough funds. Your balance is ₦${balance.toLocaleString()} but you need ₦${amount.toLocaleString()}.`,
      pidgin: (name, balance, amount) => `Sorry ${name}, your money no reach. You get ₦${balance.toLocaleString()} but you need ₦${amount.toLocaleString()}.`,
      yoruba: (name, balance, amount) => `Má bínú ${name}, owó rẹ kò tó. Ó ní ₦${balance.toLocaleString()} ṣùgbọ́n o nílò ₦${amount.toLocaleString()}.`,
      igbo: (name, balance, amount) => `Ndo ${name}, ego gị erughị. Ị nwere ₦${balance.toLocaleString()} mana ị chọrọ ₦${amount.toLocaleString()}.`,
      hausa: (name, balance, amount) => `Yi hakuri ${name}, kuɗin ku bai isa ba. Kuna da ₦${balance.toLocaleString()} amma kuna buƙatar ₦${amount.toLocaleString()}.`
    }
  },
  
  transfer: {
    success: {
      english: (amount, recipient, newBal) => `All done! ₦${amount.toLocaleString()} has been sent to ${recipient}. Your new balance is ₦${newBal.toLocaleString()}.`,
      pidgin: (amount, recipient, newBal) => `E don do! I don send ₦${amount.toLocaleString()} give ${recipient}. Your new balance na ₦${newBal.toLocaleString()}.`,
      yoruba: (amount, recipient, newBal) => `Ó tán! A ti fi ₦${amount.toLocaleString()} ránṣẹ́ sí ${recipient}. Owó rẹ yi tó kù ni ₦${newBal.toLocaleString()}.`,
      igbo: (amount, recipient, newBal) => `Ọ gwụla! Ezigala m ₦${amount.toLocaleString()} nye ${recipient}. Ego gị fọdụrụ ugbu a bụ ₦${newBal.toLocaleString()}.`,
      hausa: (amount, recipient, newBal) => `An gama! An aika ₦${amount.toLocaleString()} zuwa ga ${recipient}. Sabon kuɗin ku shine ₦${newBal.toLocaleString()}.`
    },
    userNotFound: {
      english: (recipient) => `I couldn't find a user named '${recipient}'. Please check the username.`,
      pidgin: (recipient) => `I no fit see person wey dem dey call '${recipient}'. Check the name again abeg.`,
      yoruba: (recipient) => `Mi ò rí ẹni tó ń jẹ́ '${recipient}'. Ẹ wo orúkọ náà padà.`,
      igbo: (recipient) => `Ahụghị m onye aha ya bụ '${recipient}'. Biko lelee aha ahụ ọzọ.`,
      hausa: (recipient) => `Ban sami wanda ake kira '${recipient}' ba. Don Allah duba sunan.`
    }
  },
  
  error: {
    english: "I'm not quite sure what you want me to do. Try 'check balance', 'buy airtime', or 'transfer money'.",
    pidgin: "I no too understand wetin you wan make I do. Try talk say 'check balance', 'buy airtime', or 'send money'.",
    yoruba: "Mi ò lóye ohun tó fẹ́ kí n ṣe. Gbìyànjú 'wo owó', 'ra airtime', tàbí 'fi owó ránṣẹ́'.",
    igbo: "Aghọtaghị m ihe ị chọrọ ka m mee. Gbalịa 'lelee ego', 'zụta airtime', ma ọ bụ 'zigara ego'.",
    hausa: "Ban fahimci abin da kuke so in yi ba. Gwada 'duba kuɗi', 'sayi airtime', ko 'tura kuɗi'."
  },
  
  billPayment: {
    success: {
      english: (provider, amount, newBal) => `Perfect! Your ${provider} bill of ₦${amount.toLocaleString()} has been paid. New balance: ₦${newBal.toLocaleString()}.`,
      pidgin: (provider, amount, newBal) => `E don do! Your ${provider} bill of ₦${amount.toLocaleString()} don pay finish. Your new balance na ₦${newBal.toLocaleString()}.`,
      yoruba: (provider, amount, newBal) => `Ó dára! Òwò ${provider} rẹ tó jẹ́ ₦${amount.toLocaleString()} ti san. Owó rẹ tó kù: ₦${newBal.toLocaleString()}.`,
      igbo: (provider, amount, newBal) => `Ọ dị mma! Ụgwọ ${provider} gị nke ₦${amount.toLocaleString()} akwụọla. Ego gị fọdụrụ: ₦${newBal.toLocaleString()}.`,
      hausa: (provider, amount, newBal) => `Na gode! An biya kuɗin ${provider} naku na ₦${amount.toLocaleString()}. Sabon kuɗin ku: ₦${newBal.toLocaleString()}.`
    }
  },
  
  esusu: {
    created: {
      english: (groupName) => `Great! Your esusu group "${groupName}" has been created. Share the group name with friends to invite them!`,
      pidgin: (groupName) => `E don set! Your esusu group "${groupName}" don ready. Share the group name make your people join!`,
      yoruba: (groupName) => `Ó dára! Ẹgbẹ́ esusu rẹ "${groupName}" ti ṣe tan. Fi orúkọ ẹgbẹ́ náà ránṣẹ́ sí àwọn ọ̀rẹ́ rẹ!`,
      igbo: (groupName) => `Ọ dị mma! Otu esusu gị "${groupName}" emepụtala. Kenye ndị enyi gị aha otu ahụ!`,
      hausa: (groupName) => `Mai kyau! An ƙirƙiri ƙungiyar esusu naku "${groupName}". Raba sunan ƙungiyar da abokai!`
    },
    contributed: {
      english: (amount, groupName, newBal) => `Perfect! You've contributed ₦${amount.toLocaleString()} to "${groupName}". Your new balance is ₦${newBal.toLocaleString()}.`,
      pidgin: (amount, groupName, newBal) => `Correct! You don drop ₦${amount.toLocaleString()} for "${groupName}". Your new balance na ₦${newBal.toLocaleString()}.`,
      yoruba: (amount, groupName, newBal) => `Ó dára! O ti da ₦${amount.toLocaleString()} sínú "${groupName}". Owó rẹ tó kù ni ₦${newBal.toLocaleString()}.`,
      igbo: (amount, groupName, newBal) => `Ọ dị mma! Ị nyela ₦${amount.toLocaleString()} na "${groupName}". Ego gị fọdụrụ bụ ₦${newBal.toLocaleString()}.`,
      hausa: (amount, groupName, newBal) => `Na gode! Kun bayar da ₦${amount.toLocaleString()} a cikin "${groupName}". Sabon kuɗin ku shine ₦${newBal.toLocaleString()}.`
    }
  }
};

// Helper function to get translated message
const getTranslation = (category, key, lang, ...args) => {
  try {
    const translation = translations[category]?.[key]?.[lang];
    if (typeof translation === 'function') {
      return translation(...args);
    }
    return translation || translations[category]?.[key]?.['english'];
  } catch (err) {
    return translations[category]?.[key]?.['english'] || "Sorry, something went wrong.";
  }
};
