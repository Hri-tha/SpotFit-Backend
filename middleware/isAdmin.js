// middleware/isAdmin.js
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

async function isAdmin(req, res, next) {
  // Option A: check role
  if (req.user && req.user.role === 'admin') return next();

  // Option B: check email match (explicit special admin email)
  if (req.user && ADMIN_EMAIL && req.user.email === ADMIN_EMAIL) return next();

  return res.status(403).json({ message: 'Admin access required' });
}

module.exports = isAdmin;
