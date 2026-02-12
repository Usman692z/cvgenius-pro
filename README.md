# CVGenius Pro - Advanced AI Resume Builder

An enterprise-grade resume builder with AI assistance, ATS optimization, subscription pricing, and premium features.

## 🌟 Features

### Core Features
- ✅ **User Authentication** - Secure login/signup with JWT
- ✅ **Resume Editor** - Full-featured resume builder
- ✅ **Real-time Preview** - See changes instantly
- ✅ **Multiple Resumes** - Create and manage multiple resumes
- ✅ **Professional Templates** - 50+ templates to choose from

### AI-Powered Features
- ✅ **AI Suggestions** - Real-time content improvement suggestions
- ✅ **Smart Optimization** - Keyword matching with job descriptions
- ✅ **Content Enhancement** - AI-powered writing assistance

### ATS (Applicant Tracking System)
- ✅ **ATS Testing** - Test resume against ATS systems
- ✅ **Keyword Analysis** - Identify missing keywords
- ✅ **Formatting Check** - Optimize for ATS readability
- ✅ **Score Report** - Detailed ATS compatibility report

### Premium Features
- ✅ **Subscription Plans** - Free, Pro, and Premium tiers
- ✅ **Payment Integration** - Stripe integration
- ✅ **Feature Limits** - Per-plan feature restrictions
- ✅ **Usage Tracking** - Monitor plan usage

### Export & Sharing
- ✅ **PDF Export** - Download as PDF
- ✅ **Word Export** - Download as .DOCX
- ✅ **Shareable Link** - Create public resume links
- ✅ **Email** - Send resume via email

## 📋 Pricing Plans

| Feature | Free | Pro | Premium |
|---------|------|-----|---------|
| Resumes | 1 | 5 | Unlimited |
| Templates | Basic | All | All |
| AI Suggestions | ❌ | ✅ (5/mo) | ✅ Unlimited |
| ATS Testing | ❌ | ✅ (5/mo) | ✅ Unlimited |
| PDF Export | ❌ | ✅ | ✅ |
| Premium Support | ❌ | Email | 24/7 Priority |
| Price | $0 | $9.99/mo | $19.99/mo |

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- npm 8+
- Git

### Installation

1. **Clone repository**
```bash
git clone <repo-url>
cd cvgenius-pro
```

2. **Install dependencies**
```bash
npm install
```

3. **Create .env file**
```bash
cp .env.example .env
```

4. **Update .env with your settings**
```
NODE_ENV=development
JWT_SECRET=your-secret-key
DATABASE_URL=sqlite:./database.db
```

5. **Start development server**
```bash
npm start
```

6. **Visit app**
```
http://localhost:5000
```

## 📁 Project Structure

```
cvgenius-pro/
├── server.js           # Express server
├── package.json        # Dependencies
├── .env.example        # Environment template
├── railway.json        # Railway config
├── README.md          # Documentation
└── public/
    ├── index.html     # Main app
    ├── css/
    │   └── style.css  # Styles
    └── js/
        └── app.js     # App logic
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Resumes
- `GET /api/resumes` - List all resumes
- `POST /api/resumes` - Create resume
- `GET /api/resumes/:id` - Get resume
- `PUT /api/resumes/:id` - Update resume
- `DELETE /api/resumes/:id` - Delete resume

### AI Features
- `POST /api/ai/suggestions` - Get AI suggestions

### ATS Testing
- `POST /api/ats/test` - Test ATS score

### Subscriptions
- `GET /api/plans` - List pricing plans
- `POST /api/subscribe` - Subscribe to plan
- `GET /api/subscription` - Get subscription info

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js, Express.js
- **Database**: SQLite (upgradeable to PostgreSQL)
- **Auth**: JWT
- **Security**: bcryptjs, CORS
- **Payment**: Stripe
- **AI**: OpenAI (optional)
- **Deployment**: Railway.app

## 🔒 Security

✅ Password hashing with bcryptjs
✅ JWT authentication
✅ CORS protection
✅ Environment variables for secrets
✅ Input validation
✅ XSS protection

## 📊 Deployment

### Deploy to Railway

1. **Push to GitHub**
```bash
git add .
git commit -m "Deploy CVGenius Pro"
git push origin main
```

2. **Connect to Railway**
- Go to https://railway.app
- Create new project
- Connect GitHub repository
- Configure environment variables

3. **Deploy**
- Railway auto-deploys
- App goes LIVE!

## 🎯 Future Enhancements

- [ ] LinkedIn sync
- [ ] Cover letter builder
- [ ] Interview prep
- [ ] Job matching
- [ ] Mobile app
- [ ] Real AI integration
- [ ] Advanced analytics
- [ ] Team collaboration

## 📝 License

MIT License - see LICENSE file

## 🤝 Support

- Email: support@cvgenius.com
- Discord: [Coming soon]
- Twitter: [@cvgenius](https://twitter.com/cvgenius)

## 📄 License

This project is licensed under MIT License.

---

**Made with ❤️ for your career success**
