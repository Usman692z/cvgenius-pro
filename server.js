const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ========== 1. CONNECTIONS ==========

// PostgreSQL Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Anthropic Claude Client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Email Service
const emailTransporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// ========== 2. DATABASE INITIALIZATION ==========

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
        stripeCustomerId TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS resumes (
        id SERIAL PRIMARY KEY,
        resumeId TEXT UNIQUE,
        userId TEXT,
        title TEXT,
        template TEXT DEFAULT 'modern',
        personalInfo JSONB,
        experience JSONB DEFAULT '[]',
        education JSONB DEFAULT '[]',
        skills JSONB DEFAULT '[]',
        projects JSONB DEFAULT '[]',
        certifications JSONB DEFAULT '[]',
        languages JSONB DEFAULT '[]',
        atsScore INTEGER DEFAULT 0,
        content JSONB,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        userId TEXT UNIQUE,
        plan TEXT DEFAULT 'free',
        stripeSubscriptionId TEXT,
        status TEXT DEFAULT 'active',
        usageAI INTEGER DEFAULT 0,
        usageATS INTEGER DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        renewalDate TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS aiHistory (
        id SERIAL PRIMARY KEY,
        userId TEXT,
        section TEXT,
        originalContent TEXT,
        improvedContent TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS atsHistory (
        id SERIAL PRIMARY KEY,
        resumeId TEXT,
        userId TEXT,
        score INTEGER,
        report JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database & Tables Ready");
  } catch (err) {
    console.error("❌ Database Init Error:", err);
  }
};
initDB();

// ========== 3. MIDDLEWARE ==========

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

// ========== 4. UTILITY FUNCTIONS ==========

// Send Email
const sendEmail = async (to, subject, html) => {
  try {
    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      html
    });
    console.log(`✅ Email sent to ${to}`);
  } catch (error) {
    console.error('Email error:', error);
  }
};

// ATS Scoring Algorithm
const calculateATSScore = (resume, jobDescription) => {
  const resumeText = resume.toLowerCase();
  const jobText = jobDescription.toLowerCase();

  // Keyword matching (40 points)
  const jobKeywords = jobText.split(/\s+/).filter(w => w.length > 3);
  let keywordMatches = 0;
  jobKeywords.forEach(keyword => {
    if (resumeText.includes(keyword)) keywordMatches++;
  });
  const keywordScore = Math.min(40, (keywordMatches / jobKeywords.length) * 40);

  // Formatting (30 points)
  let formattingScore = 30;
  if (resume.includes('image') || resume.includes('[img]')) formattingScore -= 10;
  if (resume.includes('table') || resume.includes('[table]')) formattingScore -= 10;
  if (resume.length > 2000) formattingScore -= 10;

  // Structure (20 points)
  let structureScore = 0;
  if (resumeText.includes('experience')) structureScore += 5;
  if (resumeText.includes('education')) structureScore += 5;
  if (resumeText.includes('skill')) structureScore += 5;
  if (resumeText.includes('summary')) structureScore += 5;

  // Content Quality (10 points)
  let contentScore = 10;
  if (resume.length < 200) contentScore -= 5;
  if (!resumeText.match(/\d+/)) contentScore -= 2;

  const totalScore = Math.round(keywordScore + formattingScore + structureScore + contentScore);

  return {
    atsScore: totalScore,
    keyword: {
      score: Math.round(keywordScore),
      matches: keywordMatches,
      missingKeywords: jobKeywords.filter(k => !resumeText.includes(k)).slice(0, 5)
    },
    formatting: {
      score: Math.round(formattingScore),
      issues: resume.includes('image') ? 'Remove images' : 'Good formatting'
    },
    structure: {
      score: structureScore,
      sections: {
        hasExperience: resumeText.includes('experience'),
        hasEducation: resumeText.includes('education'),
        hasSkills: resumeText.includes('skill'),
        hasSummary: resumeText.includes('summary')
      }
    },
    content: {
      score: contentScore,
      wordCount: resume.split(/\s+/).length
    }
  };
};

// ========== 5. AI ENDPOINTS (REAL CLAUDE) ==========

app.post('/api/ai/suggestions', verifyToken, async (req, res) => {
  try {
    const { content, section } = req.body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "AI API Key not configured" });
    }

    // Check plan limits
    const subResult = await pool.query('SELECT usageAI, plan FROM subscriptions WHERE userId = $1', [req.userId]);
    const subscription = subResult.rows[0];
    const plan = subscription?.plan || 'free';
    const currentUsage = subscription?.usageAI || 0;

    if (plan === 'free' && currentUsage >= 5) {
      return res.status(429).json({ error: 'Free plan limit reached. Upgrade for unlimited AI suggestions.' });
    }
    if (plan === 'pro' && currentUsage >= 50) {
      return res.status(429).json({ error: 'Pro plan limit reached. Upgrade to Premium.' });
    }

    // Call Claude API
    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are a professional career coach. Improve this resume ${section} section to be high-impact, professional, and result-oriented. Use action verbs, numbers, and metrics. Return only the improved text:\n\n"${content}"`
      }],
    });

    const improvedContent = msg.content[0].text;

    // Save to history
    await pool.query(
      'INSERT INTO aiHistory (userId, section, originalContent, improvedContent) VALUES ($1, $2, $3, $4)',
      [req.userId, section, content, improvedContent]
    );

    // Update usage
    await pool.query(
      'UPDATE subscriptions SET usageAI = usageAI + 1 WHERE userId = $1',
      [req.userId]
    );

    // Generate suggestions
    const suggestionsMsg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `As a career coach, provide 4 specific suggestions to improve this ${section} section: "${content}". Format as bullet points.`
      }],
    });

    const suggestions = suggestionsMsg.content[0].text.split('\n').filter(s => s.trim());

    res.json({
      success: true,
      improved: improvedContent,
      suggestions: suggestions
    });

  } catch (error) {
    console.error('Claude AI Error:', error);
    res.status(500).json({ error: 'AI generation failed' });
  }
});

// ========== 6. ATS TESTING (REAL ALGORITHM) ==========

app.post('/api/ats/test', verifyToken, async (req, res) => {
  try {
    const { resumeContent, jobDescription, resumeId } = req.body;

    if (!resumeContent || !jobDescription) {
      return res.status(400).json({ error: 'Resume and job description required' });
    }

    // Check plan limits
    const subResult = await pool.query('SELECT usageATS, plan FROM subscriptions WHERE userId = $1', [req.userId]);
    const subscription = subResult.rows[0];
    const plan = subscription?.plan || 'free';
    const currentUsage = subscription?.usageATS || 0;

    if (plan === 'free' && currentUsage >= 5) {
      return res.status(429).json({ error: 'Free plan limit reached. Upgrade for unlimited ATS testing.' });
    }
    if (plan === 'pro' && currentUsage >= 50) {
      return res.status(429).json({ error: 'Pro plan limit reached. Upgrade to Premium.' });
    }

    // Calculate ATS Score
    const report = calculateATSScore(resumeContent, jobDescription);

    // Save to history
    if (resumeId) {
      await pool.query(
        'UPDATE resumes SET atsScore = $1 WHERE resumeId = $2 AND userId = $3',
        [report.atsScore, resumeId, req.userId]
      );
    }

    await pool.query(
      'INSERT INTO atsHistory (resumeId, userId, score, report) VALUES ($1, $2, $3, $4)',
      [resumeId || null, req.userId, report.atsScore, JSON.stringify(report)]
    );

    // Update usage
    await pool.query(
      'UPDATE subscriptions SET usageATS = usageATS + 1 WHERE userId = $1',
      [req.userId]
    );

    res.json({
      success: true,
      report: report
    });

  } catch (error) {
    console.error('ATS Error:', error);
    res.status(500).json({ error: 'ATS testing failed' });
  }
});

// ========== 7. AUTHENTICATION ==========

app.post('/api/auth/register', async (req, res) => {
  const { email, password, fullName, currentRole } = req.body;
  try {
    // Check if user exists
    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = 'user_' + Date.now();

    // Create user
    await pool.query(
      'INSERT INTO users (userId, email, password, fullName, currentRole) VALUES ($1, $2, $3, $4, $5)',
      [userId, email, hashedPassword, fullName, currentRole || 'Not specified']
    );

    // Create subscription
    await pool.query(
      'INSERT INTO subscriptions (userId, plan) VALUES ($1, $2)',
      [userId, 'free']
    );

    const token = jwt.sign({ userId }, process.env.JWT_SECRET || 'your-secret');

    // Send welcome email
    await sendEmail(
      email,
      'Welcome to CVGenius Pro!',
      `<h1>Welcome, ${fullName}!</h1><p>Your account is ready. Start building your perfect resume now!</p>`
    );

    res.json({
      success: true,
      token,
      user: { userId, email, fullName, plan: 'free' }
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(400).json({ error: "Registration failed" });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user.userid }, process.env.JWT_SECRET || 'your-secret');
    res.json({
      success: true,
      token,
      user: { userId: user.userid, email: user.email, fullName: user.fullname, plan: user.plan }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: "Login error" });
  }
});

app.get('/api/auth/me', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE userId = $1', [req.userId]);
    const user = result.rows[0];
    const subResult = await pool.query('SELECT * FROM subscriptions WHERE userId = $1', [req.userId]);
    const subscription = subResult.rows[0];

    res.json({
      user: {
        userId: user.userid,
        email: user.email,
        fullName: user.fullname,
        currentRole: user.currentrole,
        plan: user.plan
      },
      subscription: subscription
    });

  } catch (err) {
    res.status(500).json({ error: "Failed to get user" });
  }
});

// ========== 8. RESUME ENDPOINTS ==========

app.get('/api/resumes', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM resumes WHERE userId = $1 ORDER BY createdAt DESC', [req.userId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get resumes' });
  }
});

app.post('/api/resumes', verifyToken, async (req, res) => {
  try {
    const { title, template } = req.body;
    const resumeId = 'res_' + Date.now();

    await pool.query(
      'INSERT INTO resumes (resumeId, userId, title, template) VALUES ($1, $2, $3, $4)',
      [resumeId, req.userId, title || 'Untitled Resume', template || 'modern']
    );

    res.json({ success: true, resumeId });

  } catch (error) {
    res.status(500).json({ error: 'Failed to create resume' });
  }
});

app.put('/api/resumes/:resumeId', verifyToken, async (req, res) => {
  try {
    const { resumeId } = req.params;
    const { personalInfo, experience, education, skills, projects, certifications, languages, content } = req.body;

    const result = await pool.query(
      'UPDATE resumes SET personalInfo = $1, experience = $2, education = $3, skills = $4, projects = $5, certifications = $6, languages = $7, content = $8, updatedAt = NOW() WHERE resumeId = $9 AND userId = $10 RETURNING *',
      [
        JSON.stringify(personalInfo),
        JSON.stringify(experience),
        JSON.stringify(education),
        JSON.stringify(skills),
        JSON.stringify(projects),
        JSON.stringify(certifications),
        JSON.stringify(languages),
        JSON.stringify(content),
        resumeId,
        req.userId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json({ success: true, resume: result.rows[0] });

  } catch (error) {
    res.status(500).json({ error: 'Failed to update resume' });
  }
});

app.get('/api/resumes/:resumeId', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM resumes WHERE resumeId = $1 AND userId = $2', [req.params.resumeId, req.userId]);
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get resume' });
  }
});

app.delete('/api/resumes/:resumeId', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM resumes WHERE resumeId = $1 AND userId = $2 RETURNING *',
      [req.params.resumeId, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ error: 'Failed to delete resume' });
  }
});

// ========== 9. PDF EXPORT ==========

app.post('/api/resumes/:resumeId/export-pdf', verifyToken, async (req, res) => {
  try {
    const resumeResult = await pool.query(
      'SELECT * FROM resumes WHERE resumeId = $1 AND userId = $2',
      [req.params.resumeId, req.userId]
    );

    if (resumeResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const resume = resumeResult.rows[0];
    const personalInfo = resume.personalinfo || {};

    // Create PDF
    const doc = new PDFDocument();
    const filename = `resume-${req.params.resumeId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    // Title
    doc.fontSize(20).font('Helvetica-Bold').text(personalInfo.fullName || 'Your Name', { align: 'center' });
    doc.fontSize(10).text(`${personalInfo.email || 'email@example.com'} | ${personalInfo.phone || '+1 (123) 456-7890'}`);
    doc.text(personalInfo.location || 'City, State');

    // Summary
    if (personalInfo.summary) {
      doc.fontSize(12).font('Helvetica-Bold').text('Professional Summary');
      doc.fontSize(10).font('Helvetica').text(personalInfo.summary);
    }

    // Experience
    if (resume.experience && resume.experience.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('Experience');
      resume.experience.forEach(job => {
        doc.fontSize(10).font('Helvetica-Bold').text(job.title + ' at ' + job.company);
        doc.fontSize(9).font('Helvetica').text(job.description || '');
      });
    }

    // Education
    if (resume.education && resume.education.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('Education');
      resume.education.forEach(edu => {
        doc.fontSize(10).font('Helvetica-Bold').text(edu.degree);
        doc.fontSize(9).font('Helvetica').text(edu.school);
      });
    }

    // Skills
    if (resume.skills && resume.skills.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('Skills');
      doc.fontSize(10).font('Helvetica').text(resume.skills.join(', '));
    }

    doc.end();

  } catch (error) {
    console.error('PDF export error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// ========== 10. STRIPE PAYMENTS ==========

app.post('/api/create-checkout-session', verifyToken, async (req, res) => {
  try {
    const { planId } = req.body;

    const userResult = await pool.query('SELECT email FROM users WHERE userId = $1', [req.userId]);
    const email = userResult.rows[0].email;

    const planPrices = {
      pro: 999,
      premium: 1999
    };

    const planNames = {
      pro: 'Pro Plan',
      premium: 'Premium Plan'
    };

    if (!planPrices[planId]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'CVGenius ' + planNames[planId],
            description: 'AI Resume Builder Subscription'
          },
          unit_amount: planPrices[planId],
          recurring: {
            interval: 'month',
            interval_count: 1
          }
        },
        quantity: 1
      }],
      mode: 'subscription',
      customer_email: email,
      client_reference_id: req.userId,
      success_url: process.env.APP_URL + '/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: process.env.APP_URL + '/pricing'
    });

    res.json({ success: true, sessionId: session.id });

  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: 'Payment session creation failed' });
  }
});

app.post('/api/webhook/stripe', async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const planMap = {
        'CVGenius Pro Plan': 'pro',
        'CVGenius Premium Plan': 'premium'
      };
      const plan = planMap[session.display_items?.[0]?.plan?.product?.name] || 'free';

      await pool.query(
        'UPDATE subscriptions SET plan = $1, stripeSubscriptionId = $2, status = $3 WHERE userId = $4',
        [plan, session.subscription, 'active', userId]
      );

      // Send confirmation email
      const userResult = await pool.query('SELECT email, fullname FROM users WHERE userId = $1', [userId]);
      if (userResult.rows[0]) {
        await sendEmail(
          userResult.rows[0].email,
          `Welcome to ${plan.toUpperCase()} Plan!`,
          `<h1>Upgrade Successful!</h1><p>You're now on the ${plan} plan with unlimited AI suggestions and ATS testing!</p>`
        );
      }
    }

    res.json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: 'Webhook error' });
  }
});

// ========== 11. PRICING ==========

app.get('/api/plans', (req, res) => {
  res.json({
    success: true,
    plans: [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        billing: 'Forever Free',
        features: [
          '1 Resume',
          'Basic Templates',
          'AI Suggestions (5/month)',
          'ATS Testing (5/month)',
          'Email Support'
        ]
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 9.99,
        billing: 'per month',
        popular: true,
        features: [
          '5 Resumes',
          'All Templates',
          'AI Suggestions (50/month)',
          'ATS Testing (50/month)',
          'PDF Export',
          'Email Support'
        ]
      },
      {
        id: 'premium',
        name: 'Premium',
        price: 19.99,
        billing: 'per month',
        features: [
          'Unlimited Resumes',
          'All Templates',
          'Unlimited AI Suggestions',
          'Unlimited ATS Testing',
          'PDF & Word Export',
          'Priority 24/7 Support',
          'LinkedIn Optimization',
          'Interview Prep'
        ]
      }
    ]
  });
});

// ========== 12. HEALTH CHECK ==========

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'CVGenius Pro is running' });
});

// ========== 13. STATIC FILES ==========

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== 14. ERROR HANDLING ==========

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ========== 15. SERVER START ==========

app.listen(PORT, () => {
  console.log(`🚀 CVGenius Pro running on port ${PORT}`);
  console.log(`📚 Database: Connected`);
  console.log(`🤖 Claude AI: ${process.env.ANTHROPIC_API_KEY ? 'Ready' : 'Not configured'}`);
  console.log(`📧 Email: ${process.env.EMAIL_USER ? 'Configured' : 'Not configured'}`);
  console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? 'Configured' : 'Not configured'}`);
});

module.exports = app;
