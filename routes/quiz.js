// routes/quiz.js
// Visan reitit: kysymysten haku, vastauksen tarkistus, pisteiden tallennus, Top 10
// Oikeita vastauksia ei koskaan lähetetä frontendiin

const express = require('express');
const Question = require('../models/Question');
const Score = require('../models/score');
const User = require('../models/user');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// Normalisoi vastaus vertailua varten:
// - poistaa alku- ja loppuvälit
// - muuttaa pieniksi kirjaimiksi
// - poistaa diakriittiset merkit
// - poistaa kaikki välit, väliviivat ja alaviivat
// Näin "Kesa Gatame", "kesa-gatame" ja "KESAGATAME" täsmäävät keskenään
function normalizeAnswer(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // diakriitit pois
    .replace(/[\s\-_]+/g, '');       // välit, väliviivat, alaviivat pois
}

// ---- HAE VISAN KYSYMYKSET ----
// Palauttaa kaikki aktiiviset kategoriat, mutta EI vastauksia
router.get('/questions', requireAuth, async (req, res) => {
  try {
    // Hae kaikki aktiiviset kysymykset, jätä answers-kenttä pois
    const questions = await Question.find({ isActive: true })
      .select('questionText category jpName attempts') // answers EI mukana
      .lean();

    // Jos kysymyksiä ei löydy, ilmoita virhe
    if (questions.length === 0) {
      return res.status(404).json({ success: false, message: 'Kysymyksiä ei löydy' });
    }

    // Palauta kysymykset
    res.json({ success: true, questions });
  } catch (error) {
    console.error('Kysymysten haku virhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

// ---- TARKISTA YKSITTÄINEN VASTAUS ----
// Frontti lähettää { questionId, given }, backend palauttaa { correct: true/false }
// Oikeaa vastausta ei koskaan paljasteta
router.post('/check', requireAuth, async (req, res) => {
  try {
    // Lue kysymyksen id ja annettu vastaus
    const { questionId, given } = req.body;

    // Tarkista että syötteet ovat oikeaa tyyppiä
    if (!questionId || typeof given !== 'string') {
      return res.status(400).json({ success: false, message: 'questionId ja given vaaditaan' });
    }

    // Hae kysymys vastauksineen
    const q = await Question.findById(questionId).lean();
    if (!q || !q.isActive) {
      return res.status(404).json({ success: false, message: 'Kysymystä ei löytynyt' });
    }

    // Normalisoi käyttäjän vastaus
    const normalGiven = normalizeAnswer(given);

    // Normalisoi kaikki hyväksytyt vastaukset joukoksi ja tarkista täsmääkö
    const correctSet = new Set((q.answers || []).map((a) => normalizeAnswer(a)));
    const isCorrect = correctSet.has(normalGiven);

    // Palauta vain oikeellisuus
    res.json({ success: true, correct: isCorrect });
  } catch (error) {
    console.error('Vastauksen tarkistus virhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

// ---- TALLENNA PISTEET ----
// Frontti lähettää lasketut pisteet pelin lopussa
router.post('/score', requireAuth, async (req, res) => {
  try {
    // Lue pisteet rungosta
    const { correct, wrong, totalQuestions } = req.body;

    // Tarkista että arvot ovat numeroita ja järkeviä
    if (
      typeof correct !== 'number' || correct < 0 ||
      typeof wrong !== 'number' || wrong < 0 ||
      typeof totalQuestions !== 'number' || totalQuestions <= 0
    ) {
      return res.status(400).json({ success: false, message: 'Virheelliset pisteet' });
    }

    // Hae käyttäjänimi tallennusta varten
    const user = await User.findById(req.user.id).select('username');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Käyttäjää ei löytynyt' });
    }

    // Luo ja tallenna pistetietue
    const score = await Score.create({
      userId: req.user.id,
      username: user.username,
      correct,
      wrong,
      totalQuestions,
    });

    // Palauta tallennettu tulos
    res.status(201).json({
      success: true,
      score: {
        correct: score.correct,
        wrong: score.wrong,
        total: score.totalQuestions,
        percentage: score.percentage,
      },
    });
  } catch (error) {
    console.error('Pisteiden tallennus virhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

// ---- TOP 10 ----
// Paras tulos per pelaaja, järjestettynä pisteiden mukaan
router.get('/top10', requireAuth, async (req, res) => {
  try {
    // Aggregaatio: ryhmittele pelaajittain ja ota paras tulos
    const top = await Score.aggregate([
      // Järjestä ensin parhaat ensin, jotta $first ottaa parhaan
      { $sort: { correct: -1, percentage: -1, quizDate: 1 } },
      // Ryhmittele käyttäjän mukaan
      {
        $group: {
          _id: '$userId',
          username: { $first: '$username' },
          bestScore: { $first: '$correct' },
          bestPercentage: { $first: '$percentage' },
        },
      },
      // Järjestä ryhmät parhaan tuloksen mukaan
      { $sort: { bestScore: -1, bestPercentage: -1 } },
      // Rajaa kymmeneen
      { $limit: 10 },
    ]);

    // Palauta lista
    res.json({ success: true, scores: top });
  } catch (error) {
    console.error('Top 10 haku virhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

// ---- OMAT TULOKSET ----
// Kirjautuneen pelaajan omat suoritukset ja paras tulos
router.get('/my-scores', requireAuth, async (req, res) => {
  try {
    // Hae käyttäjän viimeisimmät suoritukset, uusin ensin
    const scores = await Score.find({ userId: req.user.id })
      .sort({ quizDate: -1 })
      .limit(10)
      .lean();

    // Laske paras prosentti ja pelien määrä
    let bestPercentage = 0;
    scores.forEach((s) => {
      if (s.percentage > bestPercentage) bestPercentage = s.percentage;
    });

    // Hae pelien kokonaismäärä
    const totalGames = await Score.countDocuments({ userId: req.user.id });

    // Palauta tulokset ja tilastot
    res.json({
      success: true,
      scores,
      stats: { bestPercentage, totalGames },
    });
  } catch (error) {
    console.error('Omien tulosten haku virhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

module.exports = router;