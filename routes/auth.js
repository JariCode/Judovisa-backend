// routes/auth.js
// Rekisteröinti ja kirjautuminen
// Turvatarkistukset: syötteen validointi, bcrypt-hashays, brute force -lukko

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const User = require('../models/user');
const { createToken, setTokenCookie } = require('../utils/tokenUtils');

const router = express.Router();

// Vakiot brute force -suojaukseen
const MAX_ATTEMPTS = 5;          // sallitut epäonnistuneet yritykset
const LOCK_MINUTES = 15;         // lukon kesto minuutteina

// IP-pohjainen rajoitin - yleissuoja koko auth-reitistölle
// Estää saman IP:n massahyökkäykset vaikka käyttäjätunnus vaihtuisi
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuuttia
  max: 30,                  // korkeintaan 30 yritystä per IP per ikkuna
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Liikaa yrityksiä. Yritä myöhemmin uudelleen.' },
});

// Syötteen validointi - sallitaan vain turvalliset merkit
// Käyttäjätunnus: 3-20 merkkiä, vain kirjaimet, numerot, alaviiva
function validateUsername(username) {
  if (typeof username !== 'string') return false; // pitää olla merkkijono
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);   // sallitut merkit ja pituus
}

// Salasana: vähintään 8 merkkiä, enintään 100 (estää liian pitkät hyökkäykset)
// Käytetään VAIN rekisteröinnissä, ei loginissa
function validatePassword(password) {
  if (typeof password !== 'string') return false; // pitää olla merkkijono
  return password.length >= 8 && password.length <= 100; // pituusrajat
}

// ---- REKISTERÖINTI ----
router.post('/register', authLimiter, async (req, res) => {
  try {
    // Lue käyttäjätunnus ja salasana rungosta
    const { username, password } = req.body;

    // Validoi käyttäjätunnuksen muoto
    if (!validateUsername(username)) {
      return res.status(400).json({
        success: false,
        message: 'Käyttäjätunnus: 3-20 merkkiä, vain kirjaimet, numerot ja alaviiva',
      });
    }

    // Validoi salasanan pituus (vähintään 8 merkkiä)
    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Salasana: vähintään 8 merkkiä',
      });
    }

    // Tarkista onko käyttäjätunnus jo varattu
    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Käyttäjätunnus on jo varattu',
      });
    }

    // Hashaa salasana - 12 kierrosta, alkuperäistä ei tallenneta
    const passwordHash = await bcrypt.hash(password, 12);

    // Luo käyttäjä kantaan
    const user = await User.create({
      username: username.toLowerCase(),
      displayName: username,
      passwordHash,
    });

    // Luo token ja kirjaa käyttäjä sisään suoraan
    const token = createToken(user);
    setTokenCookie(res, token);

    // Palauta onnistuminen ja käyttäjän perustiedot
    res.status(201).json({
      success: true,
      user: { username: user.username, role: user.role, displayName: user.displayName },
    });
  } catch (error) {
    console.error('Rekisteröintivirhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

// ---- KIRJAUTUMINEN ----
router.post('/login', authLimiter, async (req, res) => {
  try {
    // Lue käyttäjätunnus ja salasana rungosta
    const { username, password } = req.body;

    // Validoi vain käyttäjätunnuksen muoto ennen kantakyselyä
    // Salasanan pituutta EI käytetä porttina, jotta myös lyhyet väärät
    // yritykset kasvattavat lukkolaskuria olemassa olevalle tunnukselle
    if (!validateUsername(username) || typeof password !== 'string' || password.length === 0) {
      // Geneerinen viesti - ei paljasteta mikä meni vikaan
      return res.status(401).json({
        success: false,
        message: 'Virheellinen käyttäjätunnus tai salasana',
      });
    }

    // Hae käyttäjä kannasta
    const user = await User.findOne({ username: username.toLowerCase() });

    // Jos käyttäjää ei ole, palauta geneerinen viesti
    // Ei paljasteta onko tunnus olemassa
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Virheellinen käyttäjätunnus tai salasana',
      });
    }

    // Tarkista onko tili tällä hetkellä lukossa
    if (user.isLocked()) {
      // Geneerinen viesti - ei kerrota tarkkaa lukkoaikaa
      return res.status(423).json({
        success: false,
        message: 'Tili on tilapäisesti lukittu. Yritä myöhemmin uudelleen.',
      });
    }

    // Vertaa annettua salasanaa tallennettuun hashiin
    const match = await bcrypt.compare(password, user.passwordHash);

    // Väärä salasana
    if (!match) {
      // Kasvata epäonnistuneiden yritysten määrää
      user.failedLoginAttempts += 1;

      // Jos raja täyttyi, lukitse tili määräajaksi
      if (user.failedLoginAttempts >= MAX_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
        user.failedLoginAttempts = 0; // nollaa laskuri lukon ajaksi
      }

      // Tallenna muutokset kantaan
      await user.save();

      // Geneerinen virheviesti
      return res.status(401).json({
        success: false,
        message: 'Virheellinen käyttäjätunnus tai salasana',
      });
    }

    // Onnistunut kirjautuminen - nollaa laskuri ja mahdollinen lukko
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    // Luo token ja aseta eväste
    const token = createToken(user);
    setTokenCookie(res, token);

    // Palauta onnistuminen ja käyttäjän perustiedot
    res.json({
      success: true,
      user: { username: user.username, role: user.role, displayName: user.displayName },
    });
  } catch (error) {
    console.error('Kirjautumisvirhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

// ---- ULOSKIRJAUTUMINEN ----
router.post('/logout', (req, res) => {
  // Poista token-eväste samoilla asetuksilla kuin se luotiin
  // Muuten selain ei välttämättä poista evästettä
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
  });
  // Palauta onnistuminen
  res.json({ success: true });
});

// ---- KUKA ON KIRJAUTUNUT ----
// Frontti kutsuu tätä saadakseen kirjautuneen käyttäjän tiedot
const requireAuth = require('../middleware/requireAuth');

router.get('/me', requireAuth, async (req, res) => {
  try {
    // Hae käyttäjä id:n perusteella, ei palauteta salasanahashia
    const user = await User.findById(req.user.id).select('username role displayName');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Käyttäjää ei löytynyt' });
    }
    // Palauta perustiedot
    res.json({ success: true, user: { username: user.username, role: user.role, displayName: user.displayName } });
  } catch (error) {
    console.error('Me-reitin virhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

module.exports = router;