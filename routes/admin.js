// routes/admin.js
// Järjestelmänvalvojan hallintareitit: käyttäjälista, roolin vaihto ja tilin pakkopoisto
// Suojattu requireAuth ja requireAdmin -middlewareilla

const express = require('express');
const mongoose = require('mongoose'); // LISÄTTY: Tarvitaan id-muodon validointiin NoSQL-injektioita vastaan URL-parametreissa
const User = require('../models/user');
const Score = require('../models/score');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const Log = require('../models/log');
const logEvent = require('../utils/logger');

const router = express.Router();

// Sovelletaan molempia suojauksia kaikkiin tämän tiedoston reitteihin
router.use(requireAuth);
router.use(requireAdmin);

// ---- 1. HAE KAIKKI KÄYTTÄJÄT ----
router.get('/users', async (req, res) => {
  try {
    // Haetaan kaikki käyttäjät, mutta jätetään salasanahashit turvallisuussyistä pois
    const users = await User.find({}, '-passwordHash').sort({ displayName: 1 });
    res.json({ success: true, users });
  } catch (error) {
    console.error('Käyttäjälistan haku epäonnistui:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe käyttäjiä haettaessa' });
  }
});

// ---- 2. VAIHDA KÄYTTÄJÄN ROOLIA (Player <-> Admin) ----
router.put('/users/:id/toggle-role', async (req, res) => {
  try {
    const targetId = req.params.id;

    // TURVALLISUUSKORJAUS: Estetään NoSQL-injektio URL-parametrissa tarkistamalla ID-muoto ennen kantakyselyä
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ success: false, message: 'Virheellinen käyttäjä-id' });
    }

    // ITSE SUOJELUVAISTO: Admin ei voi muuttaa omaa rooliaan
    if (targetId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Et voi alentaa tai muuttaa omaa järjestelmänvalvojan rooliasi.'
      });
    }

    const user = await User.findById(targetId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Käyttäjää ei löytynyt' });
    }

    // HAETAAN TOIMINNON TEKEVÄN ADMININ TIEDOT NIMILOKIA VARTEN
    const adminUser = await User.findById(req.user.id);

    // Vaihdetaan rooli lennosta
    user.role = user.role === 'admin' ? 'player' : 'admin';
    await user.save();

    // TALLENNETAAN LOKI KANTAAN ADMININ AIDOLLA NIMELLÄ
    await logEvent('ROLE_CHANGE', adminUser, `Muutti käyttäjän "${user.displayName}" rooliksi: ${user.role.toUpperCase()}`);

    res.json({
      success: true,
      message: `Käyttäjän ${user.displayName} rooliksi asetettu nyt: ${user.role}`,
      user: { id: user._id, role: user.role, displayName: user.displayName }
    });
  } catch (error) {
    console.error('Roolin vaihtovirhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe roolia vaihdettaessa' });
  }
});

// ---- 3. PAKKOPOISTA KÄYTTÄJÄTILIN JA TULOKSET ----
router.delete('/users/:id', async (req, res) => {
  try {
    const targetId = req.params.id;

    // TURVALLISUUSKORJAUS: Estetään NoSQL-injektio URL-parametrissa tarkistamalla ID-muoto ennen kantakyselyä
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ success: false, message: 'Virheellinen käyttäjä-id' });
    }

    // ITSE SUOJELUVAISTO: Admin ei voi poistaa itseään hallintasivulta
    if (targetId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Et voi poistaa omaa järjestelmänvalvojan tiliäsi hallintapaneelin kautta.'
      });
    }

    const user = await User.findById(targetId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Käyttäjää ei löytynyt' });
    }

    // HAETAAN TOIMINNON TEKEVÄN ADMININ TIEDOT NIMILOKIA VARTEN
    const adminUser = await User.findById(req.user.id);

    // Kirjoitetaan poisto kantaan oikealla admin-nimellä ennen kuin tiedot pyyhitään
    await logEvent('ADMIN_DELETE_USER', adminUser, `Poisti järjestelmästä käyttäjän "${user.displayName}" ja kaikki tämän pelitulokset.`);

    // Poistetaan käyttäjän pelitulokset tulostaulusta
    await Score.deleteMany({ userId: user._id });

    // Poistetaan itse tili
    await User.findByIdAndDelete(user._id);

    res.json({
      success: true,
      message: `Käyttäjätili "${user.displayName}" ja kaikki siihen liittyvät tiedot pyyhitty dojolta.`
    });
  } catch (error) {
    console.error('Käyttäjän poistovirhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe tiliä poistettaessa' });
  }
});

// ---- 4. HAE JÄRJESTELMÄLOKIT KANNASTA ----
router.get('/logs', async (req, res) => {
  try {
    const logs = await Log.find({}).sort({ timestamp: -1 }).limit(50);
    res.json({ success: true, logs: logs.reverse() });
  } catch (error) {
    console.error('Lokien haku epäonnistui:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe lokeja haettaessa' });
  }
});

module.exports = router;