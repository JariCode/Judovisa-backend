// models/gameSession.js
// Pelisession malli - backend pitää kirjaa pelin tilasta, jotta pisteitä ei voi väärentää
// Pelaajan selain ei laske pisteitä, vaan backend laskee ne tästä sessiosta

const mongoose = require('mongoose');

// Yhden kysymyksen tila session sisällä
const sessionQuestionSchema = new mongoose.Schema(
  {
    // Viittaus varsinaiseen kysymykseen
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    // Montako yritystä tähän kysymykseen oli alun perin (väärien laskentaan lopussa)
    startAttempts: {
      type: Number,
      required: true,
    },
    // Montako yritystä tähän kysymykseen on jäljellä
    attemptsLeft: {
      type: Number,
      required: true,
    },
    // Mihin vastausryhmiin (answers-listan indekseihin) on jo osuttu
    // Estää saman lukon synonyymeistä tuplapisteet
    matchedIndexes: {
      type: [Number],
      default: [],
    },
    // Montako oikeaa vastausta tähän kysymykseen on annettu
    correctCount: {
      type: Number,
      default: 0,
    },
    // Pelaajan antamat vastaukset näyttöä varten (sirujen palautus sivun päivityksessä)
    // type on 'correct', 'wrong' tai 'same'
    givenAnswers: {
    type: [
      {
        text: { type: String },
        status: { type: String }, // ◄ NYT NIMI ON 'status', tyyppi String
        _id: false,
      },
    ],
    default: [],
  },
    // Onko tämä kysymys jo käsitelty loppuun (yritykset loppu tai ohitettu)
    done: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false } // ei tarvita omaa id:tä alikohteille
);

// Koko pelisession skeema
const gameSessionSchema = new mongoose.Schema(
  {
    // Kuka pelaa - vain tämä käyttäjä saa käyttää sessiota
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Pelin kysymykset tiloineen, backendin arpomassa järjestyksessä
    questions: {
      type: [sessionQuestionSchema],
      required: true,
    },
    // Vaadittujen oikeiden vastausten kokonaismäärä (kaikkien kysymysten attempts yhteensä)
    // Tallennetaan heti alussa, jotta prosentti voidaan laskea luotettavasti
    totalRequired: {
      type: Number,
      required: true,
    },
    // Session tila: kesken vai valmis
    status: {
      type: String,
      enum: ['active', 'finished'],
      default: 'active',
    },
  },
  {
    timestamps: true, // createdAt ja updatedAt automaattisesti
  }
);

module.exports = mongoose.model('GameSession', gameSessionSchema);
