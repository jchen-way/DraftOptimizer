const mongoose = require('mongoose');

const rosterSlotSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  position: { type: String, required: true },
  cost: { type: Number, required: true },
  draftPhase: { type: String, enum: ['KEEPER', 'MAIN', 'TAXI'], required: true }
}, { _id: false });

const teamSchema = new mongoose.Schema({
  leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true },
  ownerName: { type: String, required: true },
  teamName: { type: String, required: true },
  isMyTeam: { type: Boolean, default: false },
  budget: {
    total: { type: Number, required: true },
    spent: { type: Number, default: 0 },
    remaining: { type: Number }
  },
  roster: { type: [rosterSlotSchema], default: () => [] }
});

teamSchema.pre('save', function (next) {
  if (this.budget && typeof this.budget.total === 'number') {
    this.budget.remaining = this.budget.total - (this.budget.spent || 0);
  }
  next();
});

module.exports = mongoose.model('Team', teamSchema);
