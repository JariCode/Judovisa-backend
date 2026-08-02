// utils/tokenUtils.js
// JWT-tokenin luonti ja evästeen asetus

const jwt = require('jsonwebtoken');

// Tokenin voimassaoloaika luetaan ympäristömuuttujasta, oletus 7 päivää jos ei asetettu.
// Sama arvo käytetään sekä JWT:n expiresIn:ssä että evästeen maxAge:ssa, jotta ne pysyvät synkassa.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Muuntaa yksinkertaisen kestomerkkijonon (esim. "7d", "12h", "30m") millisekunneiksi.
// Tukee vain yhtä yksikköä kerrallaan, mikä riittää tähän käyttöön.
function parseDurationToMs(duration) {
  const match = /^(\d+)([smhd])$/.exec(String(duration).trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000; // turvallinen oletus jos muoto ei täsmää

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const unitMs = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return value * unitMs[unit];
}

// Luo allekirjoitettu JWT joka sisältää käyttäjän id:n, roolin ja tokenVersionin
// tokenVersion mahdollistaa vanhojen tokenien mitätöinnin (logout, salasanan vaihto, roolin muutos)
function createToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Aseta token httpOnly-evästeeseen - JS ei pääse siihen käsiksi (XSS-suoja)
function setTokenCookie(res, token) {
  // Tuotannossa secure + sameSite none, kehityksessä löysemmät asetukset
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: parseDurationToMs(JWT_EXPIRES_IN),
  });
}

module.exports = { createToken, setTokenCookie };