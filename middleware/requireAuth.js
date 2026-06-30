// middleware/requireAuth.js
// Tarkistaa että pyynnössä on voimassa oleva JWT-token evästeessä

const jwt = require('jsonwebtoken');

// Middleware joka suojaa reitit kirjautuneille
function requireAuth(req, res, next) {
  // Lue token evästeestä (?. varmistaa ettei kaadu jos cookies puuttuu)
  const token = req.cookies?.token;

  // Jos tokenia ei ole, ei olla kirjautuneita
  if (!token) {
    return res.status(401).json({ success: false, message: 'Ei kirjautunut' });
  }

  try {
    // Varmenna token ja pura sen sisältö
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Tallenna käyttäjän tiedot pyyntöön seuraavia käsittelijöitä varten
    req.user = { id: payload.id, role: payload.role };
    // Jatka seuraavaan käsittelijään
    next();
  } catch (error) {
    // Token virheellinen tai vanhentunut
    return res.status(401).json({ success: false, message: 'Istunto vanhentunut' });
  }
}

module.exports = requireAuth;