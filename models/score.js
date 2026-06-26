// models/score.js
// Pistemalli - tallentaa yhden visa-suorituksen tuloksen

const mongoose = require('mongoose');

// Pisteskeema
const scoreSchema = new mongoose.Schema(
  {
    // Viittaus käyttäjään
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true, // nopea haku käyttäjän pisteisiin
    },
    // Käyttäjänimi tallennetaan myös tähän, jotta Top 10 ei vaadi erillistä hakua
    displayName: {
      type: String,
      required: true,
    },
    // Oikeiden vastausten määrä
    correct: {
      type: Number,
      required: true,
      min: 0,
    },
    // Väärien vastausten määrä
    wrong: {
      type: Number,
      required: true,
      min: 0,
    },
    // Vaadittujen vastausten kokonaismäärä (kaikkien kategorioiden attempts summattuna)
    totalQuestions: {
      type: Number,
      required: true,
    },
    // Prosentti, lasketaan automaattisesti ennen tallennusta
    percentage: {
      type: Number,
      min: 0,
      max: 100,
    },
    // Suorituksen ajankohta
    quizDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Laske prosentti automaattisesti ennen tallennusta
scoreSchema.pre('save', function () {
  if (this.totalQuestions > 0) {
    this.percentage = Math.round((this.correct / this.totalQuestions) * 100);
  } else {
    this.percentage = 0;
  }
});

module.exports = mongoose.model('Score', scoreSchema);