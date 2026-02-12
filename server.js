const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { Pool } = require('pg'); // Added this
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- REAL DATABASE CONNECTION ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Auto-create tables if they don't exist (Option B from before)
const initDB = async () => {
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
      content JSONB,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log("✅ Database Tables Ready");
};
initDB();
