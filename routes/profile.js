// routes/profile.js
// Profiilin hallinnan reitit: tunnuksen vaihto, salasanan vaihto ja tilin poisto
// Turvatarkistukset: istunnon varmennus, salasanan vahvistus, syötteen validointi

const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const Score = require('../models/score');
const requireAuth = require('../middleware/requireAuth');
const { createToken, setTokenCookie } = require('../utils/tokenUtils');

const router = express.Router();

// Syötteen validointi tunnukselle (samat säännöt kuin auth.js-tiedostossa)
function validateUsername(username) {
  if (typeof username !== 'string') return false;
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

// Syötteen validointi salasanalle (samat säännöt kuin auth.js-tiedostossa)
function validatePassword(password) {
  if (typeof password !== 'string') return false;
  return password.length >= 8 && password.length <= 100;
}

// ---- 1. KÄYTTÄJÄTUNNUKSEN VAIHTO ----
router.put('/update-username', requireAuth, async (req, res) => {
  try {
    const { newUsername } = req.body;

    if (!validateUsername(newUsername)) {
      return res.status(400).json({
        success: false,
        message: 'Käyttäjätunnus: 3-20 merkkiä, vain kirjaimet, numerot ja alaviiva',
      });
    }

    const lowerName = newUsername.toLowerCase();

    // Tarkistetaan, ettei tunnus ole jo jonkun muun käytössä
    const existing = await User.findOne({ username: lowerName });
    if (existing) {
      // Jos tunnus on varattu, mutta se kuuluu itselle (esim. vain kirjainkoko muuttuu), sallitaan se
      if (existing._id.toString() !== req.user.id) {
        return res.status(409).json({ success: false, message: 'Käyttäjätunnus on jo varattu' });
      }
    }

    // Haetaan käyttäjä ja päivitetään tiedot
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Käyttäjää ei löytynyt' });
    }

    user.username = lowerName;
    user.displayName = newUsername;
    await user.save();

    // Päivitetään myös Score-tauluun uusi displayName, jotta Top 10 pysyy ajan tasalla lennosta
    await Score.updateMany({ userId: user._id }, { displayName: user.displayName });

    // Luodaan uusi JWT-token ja asetetaan uusi eväste
    const token = createToken(user);
    setTokenCookie(res, token);

    res.json({
      success: true,
      message: 'Käyttäjätunnus päivitetty',
      user: { username: user.username, role: user.role, displayName: user.displayName }
    });
  } catch (error) {
    console.error('Tunnuksen päivitysvirhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

// ---- 2. SALASANAN VAIHTO ----
router.put('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Molemmat salasanat vaaditaan' });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({ success: false, message: 'Uusi salasana: vähintään 8 merkkiä' });
    }

    // Haetaan käyttäjä kannasta salasanahashin kanssa
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Käyttäjää ei löytynyt' });
    }

    // Varmistetaan nykyisen salasanan oikeellisuus bcryptillä
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Nykyinen salasana on virheellinen' });
    }

    // Hashataan uusi salasana (12 kierrosta)
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ success: true, message: 'Salasana vaihdettu onnistuneesti' });
  } catch (error) {
    console.error('Salasanan vaihtovirhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

// ---- 3. TILIN JA PISTEIDEN POISTAMINEN ----
router.delete('/delete-account', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Salasana vaaditaan tilin poistamiseksi' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Käyttäjää ei löytynyt' });
    }

    // TURVALLISUUSTARKISTUS: Admin ei voi poistaa omaa tiliään profiilisivulta
    if (user.role === 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Järjestelmänvalvoja (Admin) ei voi poistaa omaa tiliään profiilisivun kautta.' 
      });
    }

    // Varmistetaan salasana ennen poistoa
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Salasana on virheellinen' });
    }

    // Poistetaan kaikki käyttäjän suorittamat pelitulokset Score-kannasta
    await Score.deleteMany({ userId: user._id });

    // Poistetaan itse käyttäjätili
    await User.findByIdAndDelete(user._id);

    // Tyhjennetään token-eväste selaimesta välittömästi
    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie('token', {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
    });

    res.json({ success: true, message: 'Tili ja kaikki siihen liittyvät tiedot poistettu' });
  } catch (error) {
    console.error('Tilin poistovirhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

module.exports = router;