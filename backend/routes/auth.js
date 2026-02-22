const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const ACCESS_TOKEN_EXP = '15m';
const REFRESH_TOKEN_EXP = '7d';
const ACCESS_MAX_AGE = 15 * 60 * 1000;
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_EXP_MS = 60 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateAccessToken(userId) {
  return jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXP });
}

function generateRefreshToken(userId, version) {
  return jwt.sign({ userId, version }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXP });
}

function getCookieOptions(maxAge) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'strict',
    secure: isProd,                       
    path: '/',
    maxAge,
  };
}

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('accessToken', accessToken, getCookieOptions(ACCESS_MAX_AGE));
  res.cookie('refreshToken', refreshToken, getCookieOptions(REFRESH_MAX_AGE));
}

function clearAuthCookies(res) {
  res.clearCookie('accessToken', getCookieOptions(ACCESS_MAX_AGE));
  res.clearCookie('refreshToken', getCookieOptions(REFRESH_MAX_AGE));
}

function isValidPassword(value) {
  return typeof value === 'string' && value.length >= 8;
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';
    if (!normalizedEmail || !password || !normalizedDisplayName) {
      return res.status(400).json({ message: 'Email, password and displayName are required' });
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(409).json({ message: 'User already exists' });
    const user = await User.create({
      email: normalizedEmail,
      password,
      displayName: normalizedDisplayName,
    });
    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString(), user.refreshTokenVersion);
    setAuthCookies(res, accessToken, refreshToken);
    return res.status(201).json({
      user: { id: user._id, email: user.email, displayName: user.displayName }
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString(), user.refreshTokenVersion);
    setAuthCookies(res, accessToken, refreshToken);
    return res.json({
      user: { id: user._id, email: user.email, displayName: user.displayName }
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Login failed' });
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookies(res);
  return res.json({ message: 'Logged out' });
});

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) return res.status(401).json({ message: 'No refresh token' });
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.userId).select('refreshTokenVersion');
    if (!user || user.refreshTokenVersion !== decoded.version) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    const accessToken = generateAccessToken(user._id.toString());
    res.cookie('accessToken', accessToken, getCookieOptions(ACCESS_MAX_AGE));
    return res.json({ message: 'Token refreshed' });
  } catch (err) {
    return res.status(401).json({ code: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : undefined, message: err.message || 'Invalid refresh token' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const genericMessage = 'If that email exists, we sent a reset link. Check your inbox.';
  try {
    const { email } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      return res.json({ message: genericMessage });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      user.passwordResetTokenHash = tokenHash;
      user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_EXP_MS);
      await user.save({ validateBeforeSave: false });

      if (process.env.NODE_ENV !== 'production') {
        return res.json({
          message: genericMessage,
          resetToken: rawToken,
          resetUrl: `/reset-password?token=${rawToken}`,
        });
      }
    }

    return res.json({ message: genericMessage });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to start password reset' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body || {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ message: 'Reset token is required' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (confirmPassword != null && password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    }).select('+passwordResetTokenHash +passwordResetExpiresAt');

    if (!user) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired.' });
    }

    user.password = password;
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    user.refreshTokenVersion += 1;
    user.lastLogin = new Date();
    await user.save();

    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString(), user.refreshTokenVersion);
    setAuthCookies(res, accessToken, refreshToken);

    return res.json({
      message: 'Password reset successfully',
      user: { id: user._id, email: user.email, displayName: user.displayName },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to reset password' });
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required' });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }
    if (confirmPassword != null && newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const user = await User.findById(req.userId).select('+password');
    if (!user) return res.status(401).json({ message: 'User not found' });

    const passwordMatches = await user.comparePassword(currentPassword);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password must be different from current password' });
    }

    user.password = newPassword;
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    user.refreshTokenVersion += 1;
    user.lastLogin = new Date();
    await user.save();

    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString(), user.refreshTokenVersion);
    setAuthCookies(res, accessToken, refreshToken);

    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to change password' });
  }
});

module.exports = router;
