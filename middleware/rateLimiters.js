// middleware/rateLimiters.js
// Yleiset rate limit -rajoittimet muille kuin auth-reiteille.
// authLimiter (auth.js) on tiukempi koska se suojaa juuri kirjautumista/rekisteröintiä brute forcelta.
// Nämä suojaavat kirjautuneiden käyttäjien reittejä massaspämmiltä ja palvelun kuormitushyökkäyksiltä.

const rateLimit = require('express-rate-limit');

// Yleinen rajoitin pelin ja profiilin reiteille - sallii normaalin pelaamisen mutta estää spämmäyksen
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuuttia
  max: 300,                 // korkeintaan 300 pyyntöä per IP per ikkuna
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Liikaa pyyntöjä. Yritä myöhemmin uudelleen.' },
});

// Tiukempi rajoitin admin-reiteille - ylläpitotoimet ovat harvinaisempia ja arkaluontoisempia
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuuttia
  max: 100,                 // korkeintaan 100 pyyntöä per IP per ikkuna
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Liikaa pyyntöjä. Yritä myöhemmin uudelleen.' },
});

module.exports = { generalLimiter, adminLimiter };