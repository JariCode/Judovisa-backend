// models/user.js
// Käyttäjämalli - kirjautuminen vain käyttäjätunnuksella ja salasanalla
// Sisältää brute force -suojauksen kentät (epäonnistuneet yritykset + lukkoaika)

const mongoose = require('mongoose');

// Käyttäjäskeema
const userSchema = new mongoose.Schema(
  {
    // Käyttäjätunnus - aina pieni kirjaimin haun ja vertailun vuoksi
    username: {
      type: String,
      required: [true, 'Käyttäjätunnus vaaditaan'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Käyttäjätunnus vähintään 3 merkkiä'],
      maxlength: [20, 'Käyttäjätunnus enintään 20 merkkiä'],
    },
    // Näyttönimi - näytetään käyttöliittymässä käyttäjän kirjoittamassa muodossa
    displayName: {
      type: String,
      trim: true,
    },
        // Salasanan hash - alkuperäistä salasanaa ei tallenneta koskaan
    passwordHash: {
      type: String,
      required: true,
    },
    // Rooli - pelaaja tai admin
    role: {
      type: String,
      enum: ['player', 'admin'],
      default: 'player',
    },
    // Brute force: epäonnistuneiden kirjautumisten määrä
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    // Brute force: aika johon asti tili on lukittu (null = ei lukossa)
    lockUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Apumetodi: onko tili tällä hetkellä lukossa
userSchema.methods.isLocked = function () {
  // Lukko on voimassa jos lockUntil on tulevaisuudessa
  return this.lockUntil && this.lockUntil > Date.now();
};

module.exports = mongoose.model('User', userSchema);