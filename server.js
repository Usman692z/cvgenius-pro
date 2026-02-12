require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ===========================
   DATABASE CONNECTION
=========================== */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

/* ===========================
   CREATE TABLES
=========================== */

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS resumes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255),
        content JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("✅ Database ready");
  } catch (err) {
    console.error("❌ Database error:", err);
  }
}

/* ===========================
   AUTH MIDDLEWARE
=========================== */

function authenticateToken(req, res, next) {
  const token = req.headers["authorization"];
  if (!token) return res.status(401).json({ message: "Access denied" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
}

/* ===========================
   AUTH ROUTES
=========================== */

app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id",
      [email, hashedPassword]
    );

    res.json({ message: "User created", userId: result.rows[0].id });
  } catch (err) {
    res.status(400).json({ error: "Email already exists" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );

  if (result.rows.length === 0)
    return res.status(400).json({ message: "User not found" });

  const user = result.rows[0];

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword)
    return res.status(400).json({ message: "Invalid password" });

  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

/* ===========================
   RESUME ROUTES
=========================== */

app.post("/api/resumes", authenticateToken, async (req, res) => {
  const { title, content } = req.body;

  const result = await pool.query(
    "INSERT INTO resumes (user_id, title, content) VALUES ($1, $2, $3) RETURNING *",
    [req.user.id, title, content]
  );

  res.json(result.rows[0]);
});

app.get("/api/resumes", authenticateToken, async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM resumes WHERE user_id = $1",
    [req.user.id]
  );

  res.json(result.rows);
});

/* ===========================
   AI ROUTE (Anthropic)
=========================== */

if (process.env.ANTHROPIC_API_KEY) {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  app.post("/api/ai/suggest", async (req, res) => {
    const { prompt } = req.body;

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      });

      res.json({ suggestion: response.content[0].text });
    } catch (err) {
      res.status(500).json({ error: "AI request failed" });
    }
  });
}

/* ===========================
   HEALTH CHECK
=========================== */

app.get("/", (req, res) => {
  res.send("🚀 CVGenius API Running Successfully");
});

/* ===========================
   START SERVER
=========================== */

const PORT = process.env.PORT || 3000;

initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});
