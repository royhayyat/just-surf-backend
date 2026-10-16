const mongoose = require('mongoose');

// Weekly surf article (drafted by the bot, approved by the admin)
const articleSchema = new mongoose.Schema({
  title: String,
  content: String,
  date: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
  sourceUrl: String,
});

// A sponsor banner shown on chosen spots in the app
const sponsorSchema = new mongoose.Schema({
  app: { type: String, enum: ['il', 'us'], required: true },
  advertiser: { type: String, required: true }, // internal name, for you
  title: { type: String, required: true },
  text: { type: String, default: '' },
  ctaLabel: { type: String, default: '' },
  linkUrl: { type: String, required: true },
  image: { data: Buffer, contentType: String },
  imageVersion: { type: Number, default: 0 },
  allSpots: { type: Boolean, default: false },
  regions: { type: [String], default: [] },
  spotIds: { type: [String], default: [] },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  active: { type: Boolean, default: true },
  priority: { type: Number, default: 0 },
}, { timestamps: true });

// Daily counters per sponsor: impressions and clicks
const sponsorStatSchema = new mongoose.Schema({
  sponsorId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  day: { type: String, required: true }, // YYYY-MM-DD (UTC)
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
});
sponsorStatSchema.index({ sponsorId: 1, day: 1 }, { unique: true });

const Article = mongoose.models.Article || mongoose.model('Article', articleSchema);
const Sponsor = mongoose.models.Sponsor || mongoose.model('Sponsor', sponsorSchema);
const SponsorStat = mongoose.models.SponsorStat || mongoose.model('SponsorStat', sponsorStatSchema);

module.exports = { Article, Sponsor, SponsorStat };
