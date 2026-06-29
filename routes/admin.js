// routes/admin.js
// Järjestelmänvalvojan hallintareitit: käyttäjälista, roolin vaihto, tilin pakkopoisto ja kysymysten luonti
// Suojattu requireAuth ja requireAdmin -middlewareilla

const express = require('express');
const mongoose = require('mongoose'); // Tarvitaan id-muodon validointiin NoSQL-injektioita vastaan URL-parametreissa
const User = require('../models/user');
const Score = require('../models/score');
const Question = require('../models/question'); //Tuodaan kysymysmalli tietokantakyselyitä varten
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

// ---- 5. LUO UUSI VISAKYSYMYS (Teksti tai Monivalinta) ----
// Reitti: POST /api/admin/questions
router.post('/questions', async (req, res) => {
  try {
    const { type, category, jpName, questionText, attempts, answers, options } = req.body;

    // 1. INPUT-VALIDOINTI (Estetään tyhjät tai virheelliset syötteet)
    if (!type || !category || !questionText || !answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Täytä kaikki pakolliset kentät ja anna vähintään yksi oikea vastaus.' 
      });
    }

    // 2. DUPLIKAATTI-TARKISTUS (Uniikki 'type' estää kantaa menemästä sekaisin)
    const existingQuestion = await Question.findOne({ type: type.toLowerCase().trim() });
    if (existingQuestion) {
      return res.status(400).json({ 
        success: false, 
        message: `Tekninen tunniste "${type}" on jo käytössä kategoriassa: ${existingQuestion.category}.` 
      });
    }

    // 3. HAETAAN ADMININ TIEDOT AITOA LOKIMERKINTÄÄ VARTEN
    const adminUser = await User.findById(req.user.id);

    // 4. LUODAAN DOKUMENTTI (Mongoose hoitaa options-kentän tallennuksen)
    const newQuestion = await Question.create({
      type: type.toLowerCase().trim(),
      category: category.trim(),
      jpName: jpName ? jpName.trim() : undefined,
      questionText: questionText.trim(),
      attempts: parseInt(attempts, 10) || 1,
      answers: answers,
      options: options && options.length > 0 ? options : undefined, // Jos tavallinen kysymys, jätetään undefinediksi
      isActive: true
    });

    // 5. LUODAAN AITO VIHREÄ LOKIMERKINTÄ JÄRJESTELMÄÄN
    const tyyppiSuomeksi = options && options.length > 0 ? 'monivalintakysymyksen' : 'kysymyksen';
    await logEvent(
      'QUESTION_ADD', 
      adminUser, 
      `Lisäsi uuden ${tyyppiSuomeksi} kategoriaan "${newQuestion.category}" (tyyppi: ${newQuestion.type}).`
    );

    // Palautetaan onnistunut vastaus frontille
    res.status(201).json({
      success: true,
      message: 'Kysymys tallennettu ja lokitettu onnistuneesti.',
      question: newQuestion
    });

  } catch (error) {
    console.error('Virhe kysymystä luodessa:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe kysymystä tallennettaessa' });
  }
});

// ---- 6. HAE KAIKKI KYSYMYKSET (Mukaan lukien oikeat vastaukset adminille) ----
// Reitti: GET /api/admin/questions
router.get('/questions', async (req, res) => {
  try {
    // Haetaan kaikki kysymykset ja lajitellaan ne kategorian mukaan aakkosjärjestykseen
    const questions = await Question.find({}).sort({ category: 1, type: 1 });
    res.json({ success: true, questions });
  } catch (error) {
    console.error('Kysymyslistan haku epäonnistui:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe kysymyksiä haettaessa.' });
  }
});

// ---- 7. POISTA KYSYMYS PYSYVÄSTI KANNASTA ----
// Reitti: DELETE /api/admin/questions/:id
router.delete('/questions/:id', async (req, res) => {
  try {
    const questionId = req.params.id;

    // Tarkistetaan id:n muoto NoSQL-injektioiden varalta
    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({ success: false, message: 'Virheellinen kysymys-id' });
    }

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Kysymystä ei löytynyt.' });
    }

    // Haetaan adminin tiedot lokitusta varten
    const adminUser = await User.findById(req.user.id);

    // Poistetaan kysymys
    await Question.findByIdAndDelete(questionId);

    // Luodaan lokimerkintä poistosta
    await logEvent(
      'QUESTION_DELETE', 
      adminUser, 
      `Poisti kysymyksen "${question.questionText}" (tunniste: ${question.type}) kategoriasta ${question.category}.`
    );

    res.json({ success: true, message: `Kysymys "${question.type}" poistettu onnistuneesti.` });
  } catch (error) {
    console.error('Kysymyksen poistovirhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe kysymystä poistettaessa.' });
  }
});

// ---- 8. LISÄTTY: PÄIVITÄ OLEMASSA OLEVA KYSYMYS ----
// Reitti: PUT /api/admin/questions/:id
router.put('/questions/:id', async (req, res) => {
  try {
    const questionId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({ success: false, message: 'Virheellinen kysymys-id' });
    }

    const updatedQuestion = await Question.findByIdAndUpdate(
      questionId,
      {
        type: req.body.type.toLowerCase().trim(),
        category: req.body.category.trim(),
        jpName: req.body.jpName ? req.body.jpName.trim() : undefined,
        questionText: req.body.questionText.trim(),
        attempts: parseInt(req.body.attempts, 10) || 1,
        answers: req.body.answers,
        options: req.body.options && req.body.options.length > 0 ? req.body.options : undefined
      },
      { new: true }
    );

    if (!updatedQuestion) {
      return res.status(404).json({ success: false, message: 'Kysymystä ei löytynyt.' });
    }

    const adminUser = await User.findById(req.user.id);
    await logEvent(
      'QUESTION_UPDATE',
      adminUser,
      `Muokkasi kysymystä "${updatedQuestion.type}" (kategoria: ${updatedQuestion.category}).`
    );

    res.json({ success: true, message: 'Kysymys päivitetty onnistuneesti!', question: updatedQuestion });
  } catch (error) {
    console.error('Kysymyksen muokkausvirhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe kysymystä muokatessa.' });
  }
});

module.exports = router;