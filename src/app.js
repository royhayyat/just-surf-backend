const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { requireAdmin } = require('./auth');
const { dayKey, isActiveNow, toAdmin, toPublic, validateSponsorInput } = require('./sponsors');

// Simple per-IP limit for the public event endpoint, so nobody can inflate the stats
const rateLimit = ({ windowMs, max }) => {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      if (hits.size > 10000) hits.clear();
      return next();
    }
    entry.count += 1;
    if (entry.count > max) return res.status(429).json({ error: 'Too many requests' });
    next();
  };
};

const validId = (id) => mongoose.Types.ObjectId.isValid(id);

const createApp = ({ Article, Sponsor, SponsorStat }, { adminPassword } = {}) => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors());

  const admin = requireAdmin(adminPassword ? () => adminPassword : undefined);
  const baseUrl = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

  // Admin web page (the page is public, every admin API call needs the password)
  app.use('/admin', express.static(path.join(__dirname, '..', 'public')));
  app.get('/', (req, res) => res.json({ ok: true, service: 'just-surf-backend' }));

  // ============================================================
  // Articles (app + admin)
  // ============================================================
  app.get('/api/articles/latest', async (req, res) => {
    try {
      const article = await Article.findOne({ status: 'approved' }).sort({ date: -1 });
      if (!article) return res.status(404).json({ message: 'No approved articles found right now.' });
      res.json(article);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/articles/pending', admin, async (req, res) => {
    try {
      res.json(await Article.find({ status: 'pending' }).sort({ date: -1 }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/admin/articles/:id/approve', admin, async (req, res) => {
    try {
      if (!validId(req.params.id)) return res.status(404).json({ message: 'Article not found' });
      const article = await Article.findByIdAndUpdate(req.params.id, { status: 'approved' }, { returnDocument: 'after' });
      if (!article) return res.status(404).json({ message: 'Article not found' });
      res.json({ message: '🤙 Article approved successfully and is now live!', article });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/articles/:id', admin, async (req, res) => {
    try {
      if (!validId(req.params.id)) return res.status(404).json({ message: 'Article not found' });
      await Article.findByIdAndDelete(req.params.id);
      res.json({ message: '🗑️ Article deleted.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // Sponsors - public (the apps)
  // ============================================================
  app.get('/api/sponsors', async (req, res) => {
    const appName = req.query.app;
    if (!['il', 'us'].includes(appName)) return res.status(400).json({ error: 'app must be il or us' });
    try {
      const now = new Date();
      const sponsors = await Sponsor.find(
        { app: appName, active: true, startDate: { $lte: now }, endDate: { $gte: now } },
        { 'image.data': 0 },
      ).lean();
      res.set('Cache-Control', 'public, max-age=300');
      res.json({ sponsors: sponsors.filter((s) => isActiveNow(s, now)).map((s) => toPublic(s, baseUrl(req))) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/sponsors/:id/image', async (req, res) => {
    try {
      if (!validId(req.params.id)) return res.status(404).end();
      const sponsor = await Sponsor.findById(req.params.id, { image: 1 });
      if (!sponsor || !sponsor.image || !sponsor.image.data) return res.status(404).end();
      res.set('Content-Type', sponsor.image.contentType);
      res.set('Cache-Control', 'public, max-age=604800, immutable'); // the URL changes with every new image
      res.send(sponsor.image.data);
    } catch {
      res.status(500).end();
    }
  });

  // The app reports a banner view or tap: { "type": "impression" | "click" }
  app.post('/api/sponsors/:id/events', rateLimit({ windowMs: 60 * 1000, max: 120 }), express.json({ limit: '1kb' }), async (req, res) => {
    const type = req.body && req.body.type;
    if (!['impression', 'click'].includes(type)) return res.status(400).json({ error: 'type must be impression or click' });
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    try {
      const exists = await Sponsor.exists({ _id: req.params.id });
      if (!exists) return res.status(404).json({ error: 'Not found' });
      await SponsorStat.updateOne(
        { sponsorId: req.params.id, day: dayKey() },
        { $inc: { [type === 'click' ? 'clicks' : 'impressions']: 1 } },
        { upsert: true },
      );
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // Sponsors - admin
  // ============================================================
  const adminJson = express.json({ limit: '2mb' }); // room for a 1 MB image as base64

  app.get('/api/admin/check', admin, (req, res) => res.json({ ok: true }));

  app.get('/api/admin/sponsors', admin, async (req, res) => {
    try {
      const sponsors = await Sponsor.find({}, { 'image.data': 0 }).sort({ createdAt: -1 });
      const totals = await SponsorStat.aggregate([
        { $group: { _id: '$sponsorId', impressions: { $sum: '$impressions' }, clicks: { $sum: '$clicks' } } },
      ]);
      const byId = new Map(totals.map((t) => [String(t._id), t]));
      res.json(sponsors.map((s) => {
        const t = byId.get(String(s._id)) || { impressions: 0, clicks: 0 };
        return { ...toAdmin(s), impressions: t.impressions, clicks: t.clicks, live: isActiveNow(s) };
      }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/sponsors', admin, adminJson, async (req, res) => {
    const { value, errors } = validateSponsorInput(req.body || {});
    if (errors.length) return res.status(400).json({ errors });
    try {
      const sponsor = await Sponsor.create({ ...value, imageVersion: value.image ? 1 : 0 });
      res.status(201).json(toAdmin(sponsor));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/admin/sponsors/:id', admin, adminJson, async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const { value, errors } = validateSponsorInput(req.body || {}, { partial: true });
    if (errors.length) return res.status(400).json({ errors });
    try {
      const update = { $set: value };
      if (value.image) update.$inc = { imageVersion: 1 };
      if (req.body && req.body.removeImage) {
        delete value.image;
        update.$unset = { image: 1 };
      }
      const sponsor = await Sponsor.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after', projection: { 'image.data': 0 } });
      if (!sponsor) return res.status(404).json({ error: 'Not found' });
      res.json(toAdmin(sponsor));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/sponsors/:id', admin, async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    try {
      await Sponsor.findByIdAndDelete(req.params.id);
      await SponsorStat.deleteMany({ sponsorId: req.params.id });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Daily numbers for one sponsor - for the report you send the advertiser
  app.get('/api/admin/sponsors/:id/stats', admin, async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    try {
      const days = await SponsorStat.find({ sponsorId: req.params.id }, { _id: 0, day: 1, impressions: 1, clicks: 1 }).sort({ day: 1 }).lean();
      res.json(days);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
};

module.exports = { createApp };
