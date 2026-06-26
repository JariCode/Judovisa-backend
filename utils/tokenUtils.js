// utils/tokenUtils.js
// JWT-tokenin luonti ja evästeen asetus

const jwt = require('jsonwebtoken');

// Luo allekirjoitettu JWT joka sisältää käyttäjän id:n ja roolin
function createToken(user) {
  // Token vanhenee 7 päivässä
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
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
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 päivää millisekunteina
  });
}

module.exports = { createToken, setTokenCookie };