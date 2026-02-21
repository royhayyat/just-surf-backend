require('dotenv').config();
const mongoose = require('mongoose');

// אותה תבנית בדיוק כמו בשרת שלנו
const articleSchema = new mongoose.Schema({
    title: String,
    content: String,
    date: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
    sourceUrl: String
});

const Article = mongoose.model('Article', articleSchema);

const injectTestArticle = async () => {
    try {
        // התחברות למונגו בעזרת הקישור מקובץ ה-.env שלך
        await mongoose.connect(process.env.MONGO_URI);
        console.log('🌊 Connected to Database...');

        // יצירת מאמר שכבר מוגדר כ"מאושר"
        const testArticle = new Article({
            title: "Welcome to Just Surf US! 🇺🇸🏄‍♂️",
            content: "This is a live test article pulling directly from your brand new MongoDB Cloud Database! \n\nIf you are reading this in your app, it means your frontend is successfully talking to your Node.js backend, which is successfully pulling data from the cloud. \n\nGet ready for the best surf forecasting experience in the US. Stay stoked!",
            status: 'approved'
        });

        await testArticle.save();
        console.log('✅ Success! An approved test article was injected into your database.');
        
        // ניתוק ויציאה
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
};

injectTestArticle();