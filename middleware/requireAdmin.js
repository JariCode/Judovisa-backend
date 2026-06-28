// middleware/requireAdmin.js
// Varmistaa, että requireAuth on ensin suoritettu ja käyttäjän rooli on 'admin'

const User = require('../models/user');

module.exports = async function (req, res, next) {
  // requireAuth asettaa req.user -objektin, jos token on voimassa
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Kirjaudu sisään ensin' });
  }

  try {
    // Haetaan tuore ja aito tilanne suoraan tietokantadatasta id:n perusteella
    const user = await User.findById(req.user.id).select('role');
    
    // Jos käyttäjää ei löydy tai rooli ei ole admin, evätään pääsy
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Pääsy evätty: Toiminto vaatii järjestelmänvalvojan (Admin) oikeudet.' 
      });
    }

    // Jos kaikki kunnossa, päästetään pyyntö eteenpäin varsinaiselle reitille
    next();
  } catch (error) {
    console.error('Admin-tarkistuksen virhe:', error);
    return res.status(500).json({ success: false, message: 'Palvelinvirhe oikeuksia tarkistettaessa' });
  }
};