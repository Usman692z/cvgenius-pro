const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Mock database (replace with real database in production)
const users = {};
const resumes = {};
const subscriptions = {};

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

    if (users[email]) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = 'user_' + Date.now();

    users[email] = {
      userId,
      email,
      password: hashedPassword,
      fullName,
      currentRole: currentRole || 'Not specified',
      createdAt: new Date(),
      plan: 'free',
      verified: false
    };

    subscriptions[userId] = {
      plan: 'free',
      status: 'active',
      startDate: new Date(),
      features: {
        maxResumes: 1,
        aiSuggestions: false,
        atsTesting: false,
        premiumTemplates: false,
        pdfExport: false
      }
    };

    const token = generateToken(userId);

    res.json({
      success: true,
      token,
      user: {
        userId,
        email,
        fullName,
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

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = users[email];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.userId);

    res.json({
      success: true,
      token,
      user: {
        userId: user.userId,
        email: user.email,
        fullName: user.fullName,
        plan: user.plan
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', verifyToken, (req, res) => {
  try {
    const userId = req.userId;
    const userEmail = Object.keys(users).find(email => users[email].userId === userId);
    const user = users[userEmail];

    res.json({
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      currentRole: user.currentRole,
      plan: user.plan,
      subscription: subscriptions[userId]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ========== RESUME ENDPOINTS ==========

app.get('/api/resumes', verifyToken, (req, res) => {
  try {
    const userId = req.userId;
    const userResumes = Object.values(resumes).filter(r => r.userId === userId);
    res.json(userResumes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get resumes' });
  }
});

app.post('/api/resumes', verifyToken, (req, res) => {
  try {
    const userId = req.userId;
    const { title, template } = req.body;

    const resumeId = 'resume_' + Date.now();
    resumes[resumeId] = {
      resumeId,
      userId,
      title: title || 'Untitled Resume',
      template: template || 'modern',
      createdAt: new Date(),
      updatedAt: new Date(),
      personalInfo: {
        fullName: '',
        email: '',
        phone: '',
        location: '',
        summary: ''
      },
      experience: [],
      education: [],
      skills: [],
      certifications: [],
      projects: [],
      languages: [],
      atsScore: 0,
      aiSuggestions: [],
      content: {}
    };

    res.json({ success: true, resume: resumes[resumeId] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create resume' });
  }
});

app.get('/api/resumes/:resumeId', verifyToken, (req, res) => {
  try {
    const resume = resumes[req.params.resumeId];
    if (!resume || resume.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    res.json(resume);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get resume' });
  }
});

app.put('/api/resumes/:resumeId', verifyToken, (req, res) => {
  try {
    const resume = resumes[req.params.resumeId];
    if (!resume || resume.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    Object.assign(resume, req.body);
    resume.updatedAt = new Date();

    res.json({ success: true, resume });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update resume' });
  }
});

app.delete('/api/resumes/:resumeId', verifyToken, (req, res) => {
  try {
    const resume = resumes[req.params.resumeId];
    if (!resume || resume.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    delete resumes[req.params.resumeId];
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete resume' });
  }
});

// ========== AI SUGGESTIONS ENDPOINT ==========

app.post('/api/ai/suggestions', verifyToken, (req, res) => {
  try {
    const { content, section } = req.body;

    // Mock AI suggestions (integrate with OpenAI/Anthropic in production)
    const suggestions = {
      experience: [
        'Add quantifiable achievements and metrics',
        'Use action verbs to start bullet points',
        'Highlight impact and results, not just duties',
        'Include specific technologies or tools used'
      ],
      summary: [
        'Keep it concise (2-3 lines maximum)',
        'Highlight key achievements and skills',
        'Use keywords from job descriptions',
        'Show career progression and goals'
      ],
      skills: [
        'Group related skills together',
        'Include both technical and soft skills',
        'Prioritize relevant skills first',
        'Add proficiency levels'
      ],
      education: [
        'Include relevant coursework or projects',
        'Add academic achievements if strong',
        'List graduation date clearly',
        'Include relevant certifications'
      ]
    };

    res.json({
      success: true,
      suggestions: suggestions[section] || suggestions.experience,
      improved: content + ' [Improved with AI suggestions]'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get AI suggestions' });
  }
});

// ========== ATS TESTING ENDPOINT ==========

app.post('/api/ats/test', verifyToken, (req, res) => {
  try {
    const { resumeContent, jobDescription } = req.body;

    // Mock ATS testing
    const atsScore = Math.floor(Math.random() * 40) + 60; // 60-100

    const report = {
      atsScore,
      keyword: {
        score: Math.floor(Math.random() * 30) + 70,
        analysis: 'Keywords match job description well',
        missingKeywords: ['machine learning', 'cloud computing']
      },
      formatting: {
        score: Math.floor(Math.random() * 20) + 80,
        analysis: 'Clear structure and formatting',
        suggestions: ['Use standard fonts', 'Avoid graphics in critical sections']
      },
      readability: {
        score: Math.floor(Math.random() * 30) + 70,
        analysis: 'Good readability for ATS systems',
        suggestions: ['Shorten paragraphs', 'Use bullet points more']
      },
      recommendations: [
        'Add more industry keywords',
        'Use simple formatting',
        'Include full job titles',
        'Expand skills section',
        'Add measurable results'
      ]
    };

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ error: 'Failed to test ATS' });
  }
});

// ========== SUBSCRIPTION ENDPOINTS ==========

app.get('/api/plans', (req, res) => {
  res.json({
    success: true,
    plans: [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        billing: 'Forever Free',
        description: 'Perfect for getting started',
        features: [
          '1 Resume',
          'Basic templates',
          'Manual editing',
          'No AI suggestions',
          'No ATS testing',
          'No premium support'
        ],
        limits: {
          maxResumes: 1,
          aiSuggestions: false,
          atsTesting: false,
          premiumTemplates: false,
          pdfExport: false
        }
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 9.99,
        billing: 'per month',
        description: 'For serious job seekers',
        popular: true,
        features: [
          '5 Resumes',
          'All templates',
          'AI suggestions',
          'ATS testing (5/month)',
          'PDF export',
          'Email support',
          'Custom colors'
        ],
        limits: {
          maxResumes: 5,
          aiSuggestions: true,
          atsTesting: true,
          premiumTemplates: true,
          pdfExport: true
        }
      },
      {
        id: 'premium',
        name: 'Premium',
        price: 19.99,
        billing: 'per month',
        description: 'For ultimate success',
        features: [
          'Unlimited resumes',
          'All templates',
          'Unlimited AI suggestions',
          'Unlimited ATS testing',
          'PDF & Word export',
          '24/7 priority support',
          'LinkedIn optimization',
          'Interview prep',
          'Cover letter builder'
        ],
        limits: {
          maxResumes: 999,
          aiSuggestions: true,
          atsTesting: true,
          premiumTemplates: true,
          pdfExport: true
        }
      }
    ]
  });
});

app.post('/api/subscribe', verifyToken, async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.userId;

    // Mock payment processing (integrate with Stripe in production)
    if (planId === 'free') {
      subscriptions[userId].plan = 'free';
      return res.json({ success: true, message: 'Plan activated' });
    }

    // For paid plans, return Stripe session
    res.json({
      success: true,
      message: 'Redirect to payment',
      stripeSessionId: 'mock_session_' + Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: 'Subscription failed' });
  }
});

app.get('/api/subscription', verifyToken, (req, res) => {
  try {
    const subscription = subscriptions[req.userId];
    res.json(subscription);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// ========== PAYMENT WEBHOOK ==========

app.post('/api/webhook/stripe', (req, res) => {
  try {
    const { userId, planId } = req.body;

    if (subscriptions[userId]) {
      subscriptions[userId].plan = planId;
      subscriptions[userId].updatedAt = new Date();
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Webhook failed' });
  }
});

// ========== UTILITY ENDPOINTS ==========

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'CVGenius Pro Server running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'CVGenius Pro API is operational' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`✅ CVGenius Pro Server running on port ${PORT}`);
  console.log(`📖 API Docs: http://localhost:${PORT}/api/docs`);
  console.log(`🌍 Visit: http://localhost:${PORT}`);
});

module.exports = app;
