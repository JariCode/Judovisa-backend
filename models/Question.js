// models/Question.js
// Kysymysmalli - yksi dokumentti per kategoria, sisältää vastauslistan ja yritysmäärän

const mongoose = require('mongoose');

// Kysymysskeema - kategoriapohjainen
const questionSchema = new mongoose.Schema(
  {
    // Tekninen tunniste, esim. 'osaekomi' - käytetään päivityksessä uniikkina avaimena
    type: {
      type: String,
      required: [true, 'Tyyppi vaaditaan'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    // Näytettävä kategorian nimi, esim. 'Osaekomi-Waza'
    category: {
      type: String,
      required: [true, 'Kategoria vaaditaan'],
      trim: true,
    },
    // Japaninkielinen nimi, esim. '抑込技'
    jpName: {
      type: String,
      trim: true,
    },
    // Kysymysteksti pelaajalle
    questionText: {
      type: String,
      required: [true, 'Kysymysteksti vaaditaan'],
      trim: true,
    },
    // Hyväksytyt vastaukset - EI koskaan lähetetä frontendiin
    answers: {
      type: [String],
      required: [true, 'Vastaukset vaaditaan'],
      validate: {
        validator: (arr) => arr.length >= 1,
        message: 'Vähintään yksi vastaus vaaditaan',
      },
    },
    // Montako yritystä pelaajalla on tähän kategoriaan
    attempts: {
      type: Number,
      required: [true, 'Yritysmäärä vaaditaan'],
      min: [1, 'Yritysmäärä vähintään 1'],
    },
    // Onko kategoria käytössä visassa
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Question', questionSchema);