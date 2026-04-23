const jwt = require('jsonwebtoken'); // Library to sign/verify JSON Web Tokens for admin sessions

/**
 * Express middleware: require a valid Bearer JWT on protected routes.
 * Attaches decoded payload to req.admin on success.
 */
const requireAuth = (req, res, next) => {
  const authHeader = req.headers['authorization']; // Standard header name (case-insensitive in Node)
  if (!authHeader || !authHeader.startsWith('Bearer ')) { // Must be "Bearer <token>"
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }

  const token = authHeader.split(' ')[1]; // Part after "Bearer "
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Throws if bad signature or wrong secret
    req.admin = decoded; // Handlers can read admin username / role from here
    next(); // Continue to the route handler
  } catch (err) {
    if (err.name === 'TokenExpiredError') { // jwt library marks expired tokens with this name
      return res.status(403).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid token.',
    });
  }
};

module.exports = { requireAuth };
