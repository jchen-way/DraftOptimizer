require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const leaguesRoutes = require('./routes/leagues');
const teamsRoutes = require('./routes/teams');
const playersRoutes = require('./routes/players');
const draftRoutes = require('./routes/draft');
const newsRoutes = require('./routes/news');
const { requireAuth } = require('./middleware/auth');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5001;
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowVercelPreviews = String(process.env.ALLOW_VERCEL_PREVIEWS || '').toLowerCase() === 'true';

function isVercelPreviewOrigin(origin) {
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (allowVercelPreviews && isVercelPreviewOrigin(origin)) return true;
  return false;
}

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/app')
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.use(cookieParser());
app.use(
  cors({
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    origin(origin, callback) {
      // Allow server-to-server requests and local tooling without an Origin header.
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
  })
);
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('email displayName');
    if (!user) return res.status(401).json({ message: 'User not found' });
    return res.json({ id: user._id, email: user.email, displayName: user.displayName });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to get user' });
  }
});
app.use('/api/auth', authRoutes);
app.use('/api/leagues', leaguesRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/draft', draftRoutes);
app.use('/api/news', newsRoutes);

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
