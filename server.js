const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { Pool } = require('pg'); // Real database tool
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- DATABASE CONNECTION ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Automatic Table Creation
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        userId TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        fullName TEXT,
        currentRole TEXT,
        plan TEXT DEFAULT 'free',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS resumes (
        id SERIAL PRIMARY KEY,
        resumeId TEXT UNIQUE,
        userId TEXT,
        title TEXT,
        template TEXT,
        content JSONB,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database Tables Ready");
  } catch (err) {
    console.error("❌ Database Init Error:", err);
  }
};
initDB();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Utility functions
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: '7d'
  });
};

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ========== AUTHENTICATION ENDPOINTS ==========

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName, currentRole } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = 'user_' + Date.now();

    const result = await pool.query(
      'INSERT INTO users (userId, email, password, fullName, currentRole) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, email, hashedPassword, fullName, currentRole || 'Not specified']
    );

    const token = generateToken(userId);
    res.json({
      success: true,
      token,
      user: {
        userId: result.rows[0].userid,
        email: result.rows[0].email,
        fullName: result.rows[0].fullname,
        plan: 'free'
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.userid);
    res.json({
      success: true,
      token,
      user: {
        userId: user.userid,
        email: user.email,
        fullName: user.fullname,
        plan: user.plan
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE userId = $1', [req.userId]);
    const user = result.rows[0];
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ========== RESUME ENDPOINTS ==========

app.get('/api/resumes', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM resumes WHERE userId = $1', [req.userId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get resumes' });
  }
});

app.post('/api/resumes', verifyToken, async (req, res) => {
  try {
    const { title, template } = req.body;
    const resumeId = 'resume_' + Date.now();
    
    const result = await pool.query(
      'INSERT INTO resumes (resumeId, userId, title, template, content) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [resumeId, req.userId, title || 'Untitled', template || 'modern', {}]
    );

    res.json({ success: true, resume: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create resume' });
  }
});

app.get('/api/resumes/:resumeId', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM resumes WHERE resumeId = $1 AND userId = $2', [req.params.resumeId, req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching resume' });
  }
});

app.put('/api/resumes/:resumeId', verifyToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE resumes SET title = $1, content = $2, updatedAt = CURRENT_TIMESTAMP WHERE resumeId = $3 AND userId = $4',
      [req.body.title, req.body.content, req.params.resumeId, req.userId]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Update failed' });
  }
});

app.delete('/api/resumes/:resumeId', verifyToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM resumes WHERE resumeId = $1 AND userId = $2', [req.params.resumeId, req.userId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ========== AI & ATS MOCKS (No DB needed for these) ==========

app.post('/api/ai/suggestions', verifyToken, (req, res) => {
    const { section } = req.body;
    const suggestions = {
        experience: ['Add metrics', 'Use action verbs'],
        summary: ['Keep it short', 'Use keywords'],
        skills: ['Group by category'],
        education: ['List honors']
    };
    res.json({
        success: true,
        suggestions: suggestions[section] || suggestions.experience
    });
});

app.post('/api/ats/test', verifyToken, (req, res) => {
    res.json({ 
        success: true, 
        report: { atsScore: Math.floor(Math.random() * 40) + 60, recommendations: ['Add keywords'] } 
    });
});

// ========== HEALTH & START ==========

app.get('/health', (req, res) => res.json({ status: 'OK' }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ CVGenius Pro Server running on port ${PORT}`);
});

module.exports = app;
