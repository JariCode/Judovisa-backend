// utils/logger.js
const Log = require('../models/log');

/**
 * Kirjoittaa tapahtuman suoraan tietokannan Log-kokoelmaan
 * @param {string} action - Tapahtuman tyyppi (esim. 'REGISTER', 'LOGOUT')
 * @param {object} user - Käyttäjäobjekti (req.user tai erikseen haettu kantaobjekti)
 * @param {string} details - Selkeä kuvaus suomeksi tapahtumasta
 */
async function logEvent(action, user, details) {
  try {
    const newLog = new Log({
      action: action.toUpperCase(),
      userId: user ? user._id || user.id : null,
      username: user ? user.displayName || user.username : 'Vieras',
      details: details
    });
    await newLog.save();
  } catch (error) {
    console.error('Virhe kirjoitettaessa järjestelmälokia kantaan:', error);
  }
}

module.exports = logEvent;