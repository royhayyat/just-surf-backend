const crypto = require('crypto');

// Admin routes need "Authorization: Bearer <ADMIN_PASSWORD>".
// With no ADMIN_PASSWORD set, admin is closed rather than open.
const requireAdmin = (getPassword = () => process.env.ADMIN_PASSWORD) => (req, res, next) => {
  const password = getPassword();
  if (!password) return res.status(503).json({ error: 'Admin is disabled: set ADMIN_PASSWORD on the server.' });
  const header = req.get('authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(password).digest();
  if (!given || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Wrong password' });
  next();
};

module.exports = { requireAdmin };
