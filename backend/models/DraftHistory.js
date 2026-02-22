const mongoose = require('mongoose');

const draftHistorySchema = new mongoose.Schema({
  leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  amount: { type: Number, required: true },
  phase: { type: String, enum: ['KEEPER', 'MAIN', 'TAXI'], required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DraftHistory', draftHistorySchema);
