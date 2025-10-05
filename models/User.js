// models/User.js - UPDATED
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  googleId: { type: String, unique: true, sparse: true },
  avatar: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);