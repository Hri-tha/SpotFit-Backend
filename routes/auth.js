// routes/auth.js - FIXED with proper Google client initialization
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const router = express.Router();

// ✅ FIX: Initialize Google OAuth client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      name: name || email.split('@')[0],
      email,
      passwordHash,
      role: 'user'
    });

    await user.save();

    const payload = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: payload,
      message: 'Registration successful'
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const payload = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: payload,
      message: 'Login successful'
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// ✅ FIXED: Google OAuth Login
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: 'Google token required' });
    }

    console.log('Received Google token for verification');

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    console.log('Google payload received:', { email, name, googleId });

    if (!email) {
      return res.status(400).json({ message: 'Email not provided by Google' });
    }

    // Find or create user
    let user = await User.findOne({ 
      $or: [
        { email },
        { googleId }
      ]
    });

    if (!user) {
      console.log('Creating new user with Google data');
      // Create new user with Google data
      user = new User({
        name: name || email.split('@')[0],
        email,
        passwordHash: await bcrypt.hash(googleId + process.env.JWT_SECRET, 10),
        role: 'user',
        googleId
      });
      await user.save();
    } else if (!user.googleId) {
      console.log('Updating existing user with Google ID');
      // User exists but doesn't have googleId - update it
      user.googleId = googleId;
      await user.save();
    }

    // Generate JWT token
    const jwtPayload = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    const jwtToken = jwt.sign(jwtPayload, process.env.JWT_SECRET, { expiresIn: '7d' });

    console.log('Google login successful for user:', user.email);

    res.json({
      token: jwtToken,
      user: jwtPayload,
      message: 'Google login successful'
    });

  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json({ message: 'Google authentication failed: ' + err.message });
  }
});

module.exports = router;