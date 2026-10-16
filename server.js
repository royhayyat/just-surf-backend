// server.js - connects to MongoDB, starts the weekly article bot and the API
require('dotenv').config();
const mongoose = require('mongoose');
const cron = require('node-cron');
const { createApp } = require('./src/app');
const { Article, Sponsor, SponsorStat } = require('./src/models');

// ============================================================
// Weekly bot (Sunday 00:00): drafts an article that waits for admin approval
// ============================================================
cron.schedule('0 0 * * 0', async () => {
  console.log('🏄‍♂️ Surfing the web for new articles...');
  try {
    await Article.create({
      title: 'The Weekly Surf Drop: Approaching Swells & Culture',
      content: 'This is where the bot will place the 500-600 word article it scraped or generated. As a surfer, knowing the ocean is half the battle. The other half is having the right gear and mindset...',
      status: 'pending',
    });
    console.log('✅ New article drafted and waiting for Admin approval!');
  } catch (error) {
    console.error('❌ Error fetching weekly article:', error);
  }
});

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/justsurfus';

if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD is not set: the admin panel and admin API are disabled.');
}

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('🌊 Connected to Database (MongoDB)');
    const app = createApp({ Article, Sponsor, SponsorStat });
    app.listen(PORT, () => console.log(`🚀 Just Surf backend is running on port ${PORT} - admin panel at /admin`));
  })
  .catch((err) => {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  });
