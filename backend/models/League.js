const mongoose = require('mongoose');

const leagueSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  platform: { type: String, default: 'Yahoo' },
  totalBudget: { type: Number, default: 260 },
  benchSlots: { type: Number, default: 6, min: 0 },
  draftPhase: { type: String, enum: ['MAIN', 'TAXI'], default: 'MAIN' },
  taxiRoundStartedAt: { type: Date },
  rosterSlots: {
    type: {
      C: Number,
      '1B': Number,
      '2B': Number,
      '3B': Number,
      SS: Number,
      OF: Number,
      UTIL: Number,
      P: Number,
      BN: Number
    },
    default: () => ({})
  },
  scoringCategories: { type: [String], default: () => ['HR', 'RBI', 'SB', 'AVG', 'W', 'SV', 'K', 'ERA', 'WHIP'] },
  keeperFinalized: { type: Boolean, default: false },
  keeperFinalizedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('League', leagueSchema);
