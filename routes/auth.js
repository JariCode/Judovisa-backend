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
  if (typeof username !== 'string') return false;
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

// Salasana: vähintään 8 merkkiä, enintään 100 (estää liian pitkät hyökkäykset)
function validatePassword(password) {
  if (typeof password !== 'string') return false;
  return password.length >= 8 && password.length <= 100;
}

// ---- REKISTERÖINTI ----
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validoi käyttäjätunnus
    if (!validateUsername(username)) {
      return res.status(400).json({
        success: false,
        message: 'Käyttäjätunnus: 3-20 merkkiä, vain kirjaimet, numerot ja alaviiva',
      });
    }

    // Validoi salasana
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

    // Hashaa salasana - 12 kierrosta
    const passwordHash = await bcrypt.hash(password, 12);

    // Luo käyttäjä
    const user = await User.create({
      username: username.toLowerCase(),
      passwordHash,
    });

    // Luo token ja kirjaa sisään suoraan
    const token = createToken(user);
    setTokenCookie(res, token);

    res.status(201).json({
      success: true,
      user: { username: user.username, role: user.role },
    });
  } catch (error) {
    console.error('Rekisteröintivirhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

// ---- KIRJAUTUMINEN ----
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validoi syötteet jo ennen kantakyselyä
    if (!validateUsername(username) || !validatePassword(password)) {
      // Geneerinen viesti - ei paljasteta mikä meni vikaan
      return res.status(401).json({
        success: false,
        message: 'Virheellinen käyttäjätunnus tai salasana',
      });
    }

    // Hae käyttäjä
    const user = await User.findOne({ username: username.toLowerCase() });

    // Jos käyttäjää ei ole, palauta geneerinen viesti
    // Ei paljasteta onko tunnus olemassa
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Virheellinen käyttäjätunnus tai salasana',
      });
    }

    // Tarkista onko tili lukossa
    if (user.isLocked()) {
      // Geneerinen viesti - ei kerrota tarkkaa lukkoaikaa
      return res.status(423).json({
        success: false,
        message: 'Tili on tilapäisesti lukittu. Yritä myöhemmin uudelleen.',
      });
    }

    // Vertaa salasanaa hashiin
    const match = await bcrypt.compare(password, user.passwordHash);

    if (!match) {
      // Kasvata epäonnistuneiden yritysten määrää
      user.failedLoginAttempts += 1;

      // Jos raja täyttyi, lukitse tili
      if (user.failedLoginAttempts >= MAX_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
        user.failedLoginAttempts = 0; // nollaa laskuri lukon ajaksi
      }

      await user.save();

      return res.status(401).json({
        success: false,
        message: 'Virheellinen käyttäjätunnus tai salasana',
      });
    }

    // Onnistunut kirjautuminen - nollaa laskuri ja lukko
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    // Luo token
    const token = createToken(user);
    setTokenCookie(res, token);

    res.json({
      success: true,
      user: { username: user.username, role: user.role },
    });
  } catch (error) {
    console.error('Kirjautumisvirhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

// ---- ULOSKIRJAUTUMINEN ----
router.post('/logout', (req, res) => {
  // Tyhjennä evästeestä token
  res.clearCookie('token');
  res.json({ success: true });
});

module.exports = router;