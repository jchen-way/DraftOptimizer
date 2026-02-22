const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true },
  name: { type: String, required: true },
  mlbTeam: { type: String, default: '' },
  eligiblePositions: { type: [String], default: () => [] },
  isDrafted: { type: Boolean, default: false },
  draftedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  draftedFor: { type: Number },
  draftPhase: { type: String },
  activePosition: { type: String },
  projectedValue: { type: Number },
  projections: { type: mongoose.Schema.Types.Mixed },
  adp: { type: Number }
});

playerSchema.index({ leagueId: 1, name: 1 });

module.exports = mongoose.model('Player', playerSchema);
