const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const accessToken = req.cookies?.accessToken;
  if (!accessToken) {
    return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : undefined;
    return res.status(401).json({ code: code || 'INVALID_TOKEN', message: err.message || 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
