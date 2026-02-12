const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- 1. CONNECTIONS ---
// PostgreSQL Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Anthropic Claude Client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // Set this in Railway Variables
});

// --- 2. DATABASE INITIALIZATION ---
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        userId TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        fullName TEXT,
        plan TEXT DEFAULT 'free'
      );
      CREATE TABLE IF NOT EXISTS resumes (
        id SERIAL PRIMARY KEY,
        resumeId TEXT UNIQUE,
        userId TEXT,
        title TEXT,
        content JSONB,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database & Tables Ready");
  } catch (err) {
    console.error("❌ Database Init Error:", err);
  }
};
initDB();

// --- 3. MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// JWT Token Verification Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret');
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// --- 4. CLAUDE AI ENDPOINT ---
app.post('/api/ai/suggestions', verifyToken, async (req, res) => {
  try {
    const { content, section } = req.body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "AI API Key missing in Railway" });
    }

    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1024,
      messages: [{ 
        role: "user", 
        content: `You are a professional career coach. Rewrite the following resume ${section} to be high-impact, professional, and result-oriented: "${content}". Use bullet points and action verbs.` 
      }],
    });

    res.json({
      success: true,
      improved: msg.content[0].text
    });
  } catch (error) {
    console.error('Claude AI Error:', error);
    res.status(500).json({ error: 'AI generation failed' });
  }
});

// --- 5. AUTHENTICATION ENDPOINTS ---
app.post('/api/auth/register', async (req, res) => {
  const { email, password, fullName } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = 'user_' + Date.now();
    await pool.query(
      'INSERT INTO users (userId, email, password, fullName) VALUES ($1, $2, $3, $4)',
      [userId, email, hashedPassword, fullName]
    );
    const token = jwt.sign({ userId }, process.env.JWT_SECRET || 'your-secret');
    res.json({ success: true, token, userId });
  } catch (err) {
    res.status(400).json({ error: "User already exists or registration failed" });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ userId: user.userid }, process.env.JWT_SECRET || 'your-secret');
      res.json({ success: true, token, user });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (err) {
    res.status(500).json({ error: "Login error" });
  }
});

// --- 6. RESUME STORAGE ENDPOINTS ---
app.get('/api/resumes', verifyToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM resumes WHERE userId = $1', [req.userId]);
  res.json(result.rows);
});

app.post('/api/resumes', verifyToken, async (req, res) => {
  const { title, content } = req.body;
  const resumeId = 'res_' + Date.now();
  await pool.query(
    'INSERT INTO resumes (resumeId, userId, title, content) VALUES ($1, $2, $3, $4)',
    [resumeId, req.userId, title, JSON.stringify(content)]
  );
  res.json({ success: true, resumeId });
});

// --- 7. SERVER START ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 CVGenius Pro running on port ${PORT}`);
});
