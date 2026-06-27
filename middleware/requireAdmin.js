// middleware/requireAdmin.js
// Varmistaa, että requireAuth on ensin suoritettu ja käyttäjän rooli on 'admin'

module.exports = function (req, res, next) {
  // requireAuth asettaa req.user -objektin, jos token on voimassa
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Kirjaudu sisään ensin' });
  }

  // Tarkistetaan aito rooli tietokantadatasta
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Pääsy evätty: Toiminto vaatii järjestelmänvalvojan (Admin) oikeudet.' 
    });
  }

  // Jos kaikki kunnossa, päästetään pyyntö eteenpäin varsinaiselle reitille
  next();
};