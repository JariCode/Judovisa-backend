// server.js
// Express-palvelimen perusrunko: tietokantayhteys, middlewaret, reitit

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quiz');
const profileRoutes = require('./routes/profile');
const adminRoutes = require('./routes/admin');
const {
  createCsrfToken,
  setCsrfCookie,
  csrfProtection,
} = require('./middleware/csrfProtection');

const app = express();
const PORT = process.env.PORT || 5000;

// Render ja muut proxyt - luota proxyyn jotta IP saadaan oikein rate-limitiä varten
app.set('trust proxy', 1);

// Helmet - asettaa turvalliset HTTP-otsikot
// contentSecurityPolicy pois päältä: tämä on JSON-API, ei renderöi HTML/JS-sisältöä
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // sallitaan frontin fetch-kutsut eri originista
  })
);

// Varmistetaan turvaotsikot eksplisiittisesti kaikkiin vastauksiin
// (osa työkaluista ei tunnista Helmetin oletuksia, joten asetetaan ne suoraan)
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  next();
});

// CORS - sallitaan vain määritellyt originit, evästeet mukaan. Haetaan environmetistä ALLOWED_ORIGINS.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, // evästeet mukaan pyynnöissä
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  })
);

// Lue JSON-runko, rajaa koko haitallisten suurten pyyntöjen estämiseksi
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// CSRF-token voidaan hakea ennen kirjautumista ja rekisteröitymistä.
app.get('/api/csrf-token', (req, res) => {
  const token = createCsrfToken();
  setCsrfCookie(res, token);
  res.json({ success: true, token });
});

// Suojaa kaikki tilaa muuttavat API-pyynnöt, myös kirjautumisen ja rekisteröitymisen.
app.use(csrfProtection);

// Reitit
app.use('/api/auth', authRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);

// Terveystarkistus
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Palvelin toiminnassa' });
});

// 404 - reittiä ei löytynyt. Vastataan JSONina samassa muodossa kuin muutkin virheet.
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Reittiä ei löytynyt' });
});

// Keskitetty virheenkäsittely - nappaa reiteistä läpi tulleet virheet yhteen paikkaan.
app.use((err, req, res, next) => {
  console.error('Käsittelemätön virhe:', err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    success: false,
    message: isProd ? 'Palvelinvirhe' : err.message,
  });
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