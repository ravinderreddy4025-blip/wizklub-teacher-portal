const crypto = require('crypto');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const wizklubApi = require('../services/wizklubApiService');
const schoolAuthController = require('../../../../school-portal/backend/src/controllers/schoolAuthController');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

async function hashPassword(plain) {
  return bcrypt.hash(plain, await bcrypt.genSalt(10));
}

async function findOrCreateLocalAdmin(parsed) {
  const username = (parsed.username || 'admin').trim();
  const email = (
    parsed.email
    || (parsed.userId ? `wizklub.${parsed.userId}@admin.local` : null)
    || `wizklub.${username.toLowerCase()}@admin.local`
  ).trim().toLowerCase();

  let user = await User.findOne({ role: 'Admin', email });
  if (!user && parsed.userId) {
    user = await User.findOne({
      role: 'Admin',
      email: `wizklub.${String(parsed.userId).toLowerCase()}@admin.local`,
    });
  }

  if (!user) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), salt);
    user = await User.create({
      name: username,
      email,
      password: hashedPassword,
      role: 'Admin',
    });
    return user;
  }

  if (user.name !== username) {
    user.name = username;
    await user.save();
  }
  return user;
}

const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, divisionId, schoolId } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      divisionId: divisionId || null,
      schoolId: schoolId || null
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id)
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const authUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Admin portal uses WizKlub API login only (`/auth/login/admin`).
    const user = await User.findOne({
      email: normalizedEmail,
      role: { $in: ['AM', 'Dispatch'] },
    });

    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id)
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const authAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username?.trim() || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const wizklubData = await wizklubApi.adminLogin(username.trim(), password);
    const parsed = wizklubApi.parseAdminLoginResponse(wizklubData);

    if (!parsed.hasAdminRole) {
      return res.status(403).json({
        message: 'Only accounts with the Admin role can access the admin portal',
      });
    }

    if (!parsed.accessToken || !parsed.refreshToken) {
      return res.status(502).json({
        message: 'WizKlub login did not return required tokens',
      });
    }

    const user = await findOrCreateLocalAdmin(parsed);
    const resolvedUsername = parsed.username || user.name;

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: 'Admin',
      loginType: 'wizklub',
      username: resolvedUsername,
      token: generateToken(user._id),
      wizklubAccessToken: parsed.accessToken,
      wizklubRefreshToken: parsed.refreshToken,
      wizklubExpiresAt: Date.now() + (parsed.expiresIn * 1000),
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || 'Admin login failed',
    });
  }
};

const refreshAdmin = async (req, res) => {
  try {
    const { username, refreshToken } = req.body;
    if (!username?.trim() || !refreshToken) {
      return res.status(400).json({ message: 'Username and refresh token are required' });
    }

    const wizklubData = await wizklubApi.adminRefresh(username.trim(), refreshToken);
    const parsed = wizklubApi.parseAdminLoginResponse(wizklubData);

    if (!parsed.hasAdminRole) {
      return res.status(403).json({
        message: 'Only accounts with the Admin role can access the admin portal',
      });
    }

    if (!parsed.accessToken) {
      return res.status(502).json({ message: 'WizKlub refresh did not return an access token' });
    }

    const email = (
      parsed.email
      || (parsed.userId ? `wizklub.${parsed.userId}@admin.local` : null)
      || `wizklub.${username.trim().toLowerCase()}@admin.local`
    ).toLowerCase();

    let user = await User.findOne({ role: 'Admin', email });
    if (!user) {
      user = await findOrCreateLocalAdmin({
        ...parsed,
        username: parsed.username || username.trim(),
      });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: 'Admin',
      loginType: 'wizklub',
      username: parsed.username || username.trim(),
      token: generateToken(user._id),
      wizklubAccessToken: parsed.accessToken,
      wizklubRefreshToken: parsed.refreshToken || refreshToken,
      wizklubExpiresAt: Date.now() + (parsed.expiresIn * 1000),
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || 'Admin session refresh failed',
    });
  }
};

const logoutAdmin = async (req, res) => {
  try {
    const accessToken = req.body?.accessToken
      || (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null)
      || req.body?.wizklubAccessToken;

    if (accessToken) {
      try {
        await wizklubApi.adminLogout(accessToken);
      } catch (error) {
        // Local logout should still succeed if remote logout fails.
        console.warn('WizKlub admin logout failed:', error.message);
      }
    }

    res.json({ message: 'Logged out' });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || 'Admin logout failed',
    });
  }
};

module.exports = {
  registerUser,
  authUser,
  authAdmin,
  refreshAdmin,
  logoutAdmin,
  ...schoolAuthController,
};
