// server.js
// Express-palvelimen perusrunko: tietokantayhteys, middlewaret, reitit

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quiz');
const profileRoutes = require('./routes/profile');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// Render ja muut proxyt - luota proxyyn jotta IP saadaan oikein rate-limitiä varten
app.set('trust proxy', 1);

// CORS - sallitaan vain määritellyt originit, evästeet mukaan. Haetaan environmetistä ALLOWED_ORIGINS.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, // evästeet mukaan pyynnöissä
  })
);

// Lue JSON-runko, rajaa koko haitallisten suurten pyyntöjen estämiseksi
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Reitit
app.use('/api/auth', authRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);

// Terveystarkistus
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Palvelin toiminnassa' });
});

// Yhdistä tietokantaan ja käynnistä palvelin
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Yhdistetty MongoDB Atlasiin');
    app.listen(PORT, () => {
      console.log(`Palvelin käynnissä portissa ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Tietokantayhteys epäonnistui:', error.message);
    process.exit(1);
  });