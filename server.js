// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// 1. מסד נתונים (Schema) - איך מאמר נראה במערכת
// ============================================================
const articleSchema = new mongoose.Schema({
    title: String,
    content: String,
    date: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
    sourceUrl: String
});

const Article = mongoose.model('Article', articleSchema);

// ============================================================
// 2. הבוט השבועי (Cron Job) - סורק ומביא מאמר
// ============================================================
// הבוט מכוון לרוץ כל יום ראשון בשעה 00:00 (חצות)
// הפורמט: '0 0 * * 0'
cron.schedule('0 0 * * 0', async () => {
    console.log('🏄‍♂️ Surfing the web for new articles...');
    
    try {
        // כאן הבוט יבצע קריאה לרשת (למשל לאתר חדשות גלישה או API של OpenAI)
        // לצורך ההתחלה, יצרנו פונקציה שמייצרת מאמר דמה שמחכה לאישור שלך:
        
        const newArticle = new Article({
            title: "The Weekly Surf Drop: Approaching Swells & Culture",
            content: "This is where the bot will place the 500-600 word article it scraped or generated. As a surfer, knowing the ocean is half the battle. The other half is having the right gear and mindset...\n\n(כאן הבוט ישתול את הטקסט המלא שהוא אסף מהרשת. כרגע המאמר מוגדר בסטטוס 'ממתין לאישור').",
            status: 'pending'
        });
        
        await newArticle.save();
        console.log('✅ New article drafted and waiting for Admin approval!');
    } catch (error) {
        console.error('❌ Error fetching weekly article:', error);
    }
});

// ============================================================
// 3. API לאפליקציה (Just Surf US)
// ============================================================

// נתיב זה ישמש את האפליקציה כדי לקבל את המאמר המאושר האחרון בלבד
app.get('/api/articles/latest', async (req, res) => {
    try {
        const article = await Article.findOne({ status: 'approved' }).sort({ date: -1 });
        if (!article) return res.status(404).json({ message: 'No approved articles found right now.' });
        res.json(article);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// 4. API לפאנל הניהול (בשבילך לאשר מאמרים)
// ============================================================

// קבלת כל המאמרים שממתינים לאישור שלך
app.get('/api/admin/articles/pending', async (req, res) => {
    try {
        const articles = await Article.find({ status: 'pending' }).sort({ date: -1 });
        res.json(articles);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// אישור מאמר (משנה את הסטטוס ל-approved והופך אותו לזמין באפליקציה)
app.put('/api/admin/articles/:id/approve', async (req, res) => {
    try {
        const article = await Article.findByIdAndUpdate(
            req.params.id, 
            { status: 'approved' }, 
            { new: true }
        );
        if (!article) return res.status(404).json({ message: 'Article not found' });
        res.json({ message: '🤙 Article approved successfully and is now live!', article });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// מחיקת מאמר (אם הבוט הביא מאמר לא רלוונטי ואתה רוצה לזרוק אותו)
app.delete('/api/admin/articles/:id', async (req, res) => {
    try {
        await Article.findByIdAndDelete(req.params.id);
        res.json({ message: '🗑️ Article deleted.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// 5. הרצת השרת
// ============================================================
const PORT = process.env.PORT || 3000;

// כאן יש להכניס את כתובת ה-MongoDB שלך (אפשר לפתוח בחינם ב-MongoDB Atlas)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/justsurfus';

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('🌊 Connected to Database (MongoDB)');
        app.listen(PORT, () => console.log(`🚀 Just Surf US Backend is running on port ${PORT}`));
    })
    .catch(err => {
        console.error('❌ Database connection error:', err);
    });