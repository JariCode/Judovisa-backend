// middleware/requireAuth.js
// Tarkistaa että pyynnössä on voimassa oleva JWT-token evästeessä
// Tarkistaa myös tokenVersionin kannasta - näin logout, salasanan vaihto
// ja admin roolin muutos mitätöivät vanhat tokenit heti, eivätkä vasta 7 päivän kuluttua

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/user');

// Middleware joka suojaa reitit kirjautuneille
async function requireAuth(req, res, next) {
  // Lue token evästeestä (?. varmistaa ettei kaadu jos cookies puuttuu)
  const token = req.cookies?.token;

  // Jos tokenia ei ole, ei olla kirjautuneita
  if (!token) {
    return res.status(401).json({ success: false, message: 'Ei kirjautunut' });
  }

  try {
    // Varmenna token ja pura sen sisältö
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Varmistetaan id-muoto ennen kantakyselyä NoSQL-injektioita vastaan
    if (!mongoose.Types.ObjectId.isValid(payload.id)) {
      return res.status(401).json({ success: false, message: 'Istunto vanhentunut' });
    }

    // Haetaan käyttäjän tuore tokenVersion kannasta ja verrataan tokenin sisältöön.
    // Jos ne eivät täsmää, token on mitätöity (esim. salasana vaihdettu toisella laitteella) -> hylätään
    const user = await User.findById(payload.id).select('tokenVersion');
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      return res.status(401).json({ success: false, message: 'Istunto vanhentunut' });
    }

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