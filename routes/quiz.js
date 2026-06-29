// routes/quiz.js
// Visan reitit: kysymysten haku, vastauksen tarkistus, pisteiden tallennus, Top 10
// Oikeita vastauksia ei koskaan lähetetä frontendiin
// Pisteet lasketaan backendin pelisessiosta, jotta niitä ei voi väärentää

const express = require('express');
const mongoose = require('mongoose'); // LISÄTTY: Tarvitaan id-muodon validointiin NoSQL-injektioita vastaan
const Question = require('../models/question');
const Score = require('../models/score');
const User = require('../models/user');
const requireAuth = require('../middleware/requireAuth');
const GameSession = require('../models/gameSession');

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
    // Hae kaikki aktiiviset kysymykset, otetaan mukaan options monivalintoja varten
    const questions = await Question.find({ isActive: true })
      .select('questionText category jpName attempts options') // LISÄTTY: options mukana!
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

// ---- ALOITA PELI (luo sessio) ----
// Backend arpoo kysymykset ja luo pelisession, jotta pisteet lasketaan palvelimella
router.post('/start', requireAuth, async (req, res) => {
  try {
    // Sulje pelaajan mahdolliset vanhat keskeneräiset sessiot
    // Näin pelaajalla on aina vain yksi aktiivinen sessio kerrallaan
    await GameSession.updateMany(
      { userId: req.user.id, status: 'active' },
      { status: 'finished' }
    );

    // Hae kaikki aktiiviset kysymykset vastauksineen (vastauksia ei lähetetä frontille)
    const allQuestions = await Question.find({ isActive: true }).lean();

    // Jos kysymyksiä ei ole, ei voi aloittaa
    if (allQuestions.length === 0) {
      return res.status(404).json({ success: false, message: 'Kysymyksiä ei löydy' });
    }

    // Sekoita kysymysten järjestys backendissä (Fisher-Yates)
    for (let i = allQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
    }

    // Rakenna session kysymystilat: jokaiselle yritykset ja tyhjä osumahistoria
    // alkuperäiset yritykset talletetaan startAttempts-kenttään, jotta väärät voidaan laskea lopuksi
    const sessionQuestions = allQuestions.map((q) => ({
      questionId: q._id,
      startAttempts: q.attempts,
      attemptsLeft: q.attempts,
      matchedIndexes: [],
      correctCount: 0,
      done: false,
    }));

    // Laske vaadittujen oikeiden vastausten kokonaismäärä (kaikkien attempts yhteensä)
    const totalRequired = allQuestions.reduce((sum, q) => sum + q.attempts, 0);

    // Luo sessio kantaan
    const session = await GameSession.create({
      userId: req.user.id,
      questions: sessionQuestions,
      totalRequired,
      status: 'active',
    });

    // Rakenna frontille kevyt versio kysymyksistä ILMAN vastauksia
    // Säilytetään sama järjestys kuin sessiossa
    const clientQuestions = allQuestions.map((q) => ({
      _id: q._id,
      category: q.category,
      jpName: q.jpName,
      questionText: q.questionText,
      attempts: q.attempts,
      options: q.options || [],
    }));

    // Palauta session id ja kysymykset frontille
    res.status(201).json({
      success: true,
      sessionId: session._id,
      questions: clientQuestions,
    });
  } catch (error) {
    console.error('Pelin aloitus virhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

// ---- TARKISTA YKSITTÄINEN VASTAUS (sessiopohjainen) ----
// Frontti lähettää { sessionId, questionId, given }
// Backend tarkistaa vastauksen, vähentää yritykset ja kirjaa osuman sessioon
// Pisteitä ei lasketa frontissa, vaan ne kertyvät tänne sessioon
router.post('/check', requireAuth, async (req, res) => {
  try {
    // Lue session id, kysymyksen id ja annettu vastaus
    const { sessionId, questionId, given } = req.body;

    // Tarkista syötteiden tyypit
    if (!sessionId || !questionId || typeof given !== 'string') {
      return res.status(400).json({ success: false, message: 'sessionId, questionId ja given vaaditaan' });
    }

    // Tarkista id-muodot NoSQL-injektiota vastaan
    if (!mongoose.Types.ObjectId.isValid(sessionId) || !mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({ success: false, message: 'Virheellinen id-muoto' });
    }

    // Hae sessio
    const session = await GameSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Sessiota ei löytynyt' });
    }

    // Tarkista että sessio kuuluu tälle pelaajalle (ei voi käyttää toisen sessiota)
    if (session.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Tämä ei ole sinun pelisessiosi' });
    }

    // Tarkista että sessio on vielä käynnissä
    if (session.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Peli on jo päättynyt' });
    }

    // Etsi tämän kysymyksen tila sessiosta
    const qState = session.questions.find((sq) => sq.questionId.toString() === questionId);
    if (!qState) {
      return res.status(400).json({ success: false, message: 'Kysymys ei kuulu tähän peliin' });
    }

    // Jos kysymys on jo käsitelty loppuun tai yritykset loppu, ei hyväksytä
    if (qState.done || qState.attemptsLeft <= 0) {
      return res.status(400).json({ success: false, message: 'Tähän kysymykseen ei voi enää vastata' });
    }

    // Hae varsinainen kysymys vastauksineen
    const q = await Question.findById(questionId).lean();
    if (!q || !q.isActive) {
      return res.status(404).json({ success: false, message: 'Kysymystä ei löytynyt' });
    }

    // Normalisoi pelaajan vastaus
    const normalGiven = normalizeAnswer(given);

    // TARKISTUS: Onko pelaaja kirjoittanut tämän täsmälleen saman tekstin jo aiemmin tässä kysymyksessä?
    const isDuplicateText = qState.givenAnswers.some(ans => normalizeAnswer(ans.text) === normalGiven);

    // Etsi mihin vastausryhmään vastaus osuu (synonyymit pystyviivalla)
    let matchIndex = -1;
    for (let i = 0; i < (q.answers || []).length; i++) {
      const synonyms = q.answers[i].split('|').map((s) => normalizeAnswer(s));
      if (synonyms.includes(normalGiven)) {
        matchIndex = i;
        break;
      }
    }

    // Vähennetään yritys AINA (oikein, väärin tai jo annettu - kaikki kuluttavat yrityksen satavarmasti)
    qState.attemptsLeft -= 1;

    // Päätellään vastauksen tila
    let result; // 'correct', 'wrong' tai 'already'

    if (isDuplicateText) {
      // Sama teksti annettu uudestaan (oli se aiemmin oikein tai väärin) - kuluttaa yrityksen, ei pistettä
      result = 'already';
    } else if (matchIndex === -1) {
      // Uusi väärä vastaus
      result = 'wrong';
    } else if (qState.matchedIndexes.includes(matchIndex)) {
      // Oikea lukko mutta jo annettu aiemmin (synonyymi tai sama) - ei uutta pistettä
      result = 'already';
    } else {
      // Uusi oikea vastaus - kirjaa osuma ja kasvata oikeiden määrää
      qState.matchedIndexes.push(matchIndex);
      qState.correctCount += 1;
      result = 'correct';
    }

    // Tallennetaan annettu vastaus istuntodokumenttiin talteen ennen tallennusta
    qState.givenAnswers.push({ text: given, type: result });

    // Onko kysymys nyt valmis: yritykset loppu TAI kaikki vaaditut oikein
    if (qState.attemptsLeft <= 0 || qState.correctCount >= q.attempts) {
      qState.done = true;
    }

    // Tallenna session muutokset
    await session.save();

    // Palauta frontille tulos ja kysymyksen päivittynyt tila näkymää varten
    res.json({
      success: true,
      result,                              // 'correct' | 'wrong' | 'already'
      attemptsLeft: qState.attemptsLeft,   // montako yritystä jäljellä
      correctCount: qState.correctCount,   // montako oikein tähän kysymykseen
      questionDone: qState.done,           // onko kysymys valmis
      givenAnswers: qState.givenAnswers,   // pelaajan antamat vastaukset
    });
  } catch (error) {
    console.error('Vastauksen tarkistus virhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

// ---- HAE SESSION NYKYTILA ----
// Frontti kutsuu tätä esim. sivun päivityksen jälkeen jatkaakseen keskeneräistä peliä
// Palauttaa kysymysten tilan mutta EI vastauksia
router.get('/session/:id', requireAuth, async (req, res) => {
  try {
    const sessionId = req.params.id;

    // Tarkista id-muoto
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, message: 'Virheellinen sessionId' });
    }

    // Hae sessio
    const session = await GameSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Sessiota ei löytynyt' });
    }

    // Tarkista että sessio kuuluu tälle pelaajalle
    if (session.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Tämä ei ole sinun pelisessiosi' });
    }

    // Jos sessio on jo päättynyt, frontti ei voi jatkaa sitä
    if (session.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Peli on jo päättynyt' });
    }

    // Hae kysymysten perustiedot (ilman vastauksia) sessiossa olevien id:iden mukaan
    const ids = session.questions.map((sq) => sq.questionId);
    const questionDocs = await Question.find({ _id: { $in: ids } })
      .select('questionText category jpName attempts options')
      .lean();

    // Tee id-pohjainen haku, jotta saadaan tiedot oikeaan järjestykseen
    const byId = {};
    questionDocs.forEach((qd) => { byId[qd._id.toString()] = qd; });

    // Rakenna frontille kysymykset session järjestyksessä, mukaan kunkin tila
    const questions = session.questions.map((sq) => {
      const qd = byId[sq.questionId.toString()];
      return {
        _id: sq.questionId,
        category: qd ? qd.category : '',
        jpName: qd ? qd.jpName : '',
        questionText: qd ? qd.questionText : '',
        attempts: qd ? qd.attempts : sq.startAttempts,
        options: qd && qd.options ? qd.options : [],
        // session tila tästä kysymyksestä
        attemptsLeft: sq.attemptsLeft,
        correctCount: sq.correctCount,
        done: sq.done,
        // Palautetaan aiemmin tallennetut vastaussirut myös session palautuksessa
        givenAnswers: sq.givenAnswers || [],
      };
    });

    // Palauta session tila ja kysymykset
    res.json({
      success: true,
      sessionId: session._id,
      questions,
    });
  } catch (error) {
    console.error('Session haku virhe:', error);
    res.status(500).json({ success: false, message: 'Palvelinvirhe' });
  }
});

// ---- TALLENNA PISTEET (sessiopohjainen) ----
// Frontti lähettää vain sessionId:n - pisteet lasketaan backendin sessiosta
// Näin pelaaja ei voi väärentää pistemääräänsä konsolin kautta
router.post('/score', requireAuth, async (req, res) => {
  try {
    // Lue session id
    const { sessionId } = req.body;

    // Tarkista id:n olemassaolo ja muoto
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, message: 'Virheellinen sessionId' });
    }

    // Hae sessio
    const session = await GameSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Sessiota ei löytynyt' });
    }

    // Tarkista että sessio kuuluu tälle pelaajalle
    if (session.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Tämä ei ole sinun pelisessiosi' });
    }

    // Estä saman session tallennus kahdesti (ei voi kerätä pisteitä moneen kertaan)
    if (session.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Tämä peli on jo tallennettu' });
    }

    // Laske pisteet sessiosta - backend on totuuden lähde
    let correct = 0; // oikeat osumat yhteensä
    let wrong = 0;   // väärät yritykset yhteensä
    session.questions.forEach((sq) => {
      // Oikeat = kaikkien kysymysten oikeat osumat
      correct += sq.correctCount;
      // Käytetyt yritykset tässä kysymyksessä = alkuperäiset - jäljellä
      const used = sq.startAttempts - sq.attemptsLeft;
      // Väärät tässä kysymyksessä = käytetyt yritykset - oikeat osumat
      // (sisältää sekä väärät että jo annetut synonyymit, koska ne kuluttivat yrityksen ilman uutta pistettä)
      wrong += used - sq.correctCount;
    });

    // Vaaditut yhteensä on tallennettu sessioon jo alussa
    const totalRequired = session.totalRequired;

    // Sulje sessio, jottei sitä voi tallentaa uudelleen
    session.status = 'finished';
    await session.save();

    // Hae käyttäjänimi tallennusta varten
    const user = await User.findById(req.user.id).select('displayName');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Käyttäjää ei löytynyt' });
    }

    // Luo ja tallenna pistetietue backendin laskemilla luvuilla
    const score = await Score.create({
      userId: req.user.id,
      displayName: user.displayName,
      correct,
      wrong,
      totalQuestions: totalRequired,
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
          displayName: { $first: '$displayName' },
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