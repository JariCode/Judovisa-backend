// models/log.js
const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  action: { 
    type: String, 
    required: true // esim. 'LOGIN', 'REGISTER', 'ROLE_CHANGE', 'DELETE_ACCOUNT'
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null // voi olla null, jos käyttäjä poistetaan tai kyseessä on vieras
  },
  username: { 
    type: String, 
    required: true // tallennetaan nimen tekstiversio, jotta se säilyy vaikka tili poistettaisiin
  },
  details: { 
    type: String, 
    required: true // vapaamuotoinen kuvaus, esim. "Vaihtoi nimekseen Jarppa"
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
});

// Poistaa automaattisesti yli 12 kuukautta (365 vrk) vanhat lokimerkinnät, jottei loki kasva loputtomasti
logSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 });

module.exports = mongoose.models.Log || mongoose.model('Log', logSchema);