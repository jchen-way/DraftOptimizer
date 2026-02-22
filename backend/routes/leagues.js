const express = require('express');
const League = require('../models/League');
const Team = require('../models/Team');
const Player = require('../models/Player');
const DraftHistory = require('../models/DraftHistory');
const { MOCK_PLAYERS } = require('../data/samplePlayers');

const router = express.Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

function parseBenchSlots(value, fallback = 6) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

router.get('/', async (req, res) => {
  try {
    const leagues = await League.find({ userId: req.userId }).sort({ createdAt: -1 });
    return res.json(leagues);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to list leagues' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, totalBudget, rosterSlots, scoringCategories, benchSlots } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    const normalizedBenchSlots = parseBenchSlots(benchSlots, 6);
    const league = await League.create({
      userId: req.userId,
      name,
      totalBudget: totalBudget != null ? Number(totalBudget) : 260,
      benchSlots: normalizedBenchSlots,
      rosterSlots: rosterSlots || {},
      scoringCategories: Array.isArray(scoringCategories) ? scoringCategories : ['HR', 'RBI', 'SB', 'AVG', 'W', 'SV', 'K', 'ERA', 'WHIP']
    });
    return res.status(201).json(league);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to create league' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const league = await League.findById(req.params.id);
    if (!league) return res.status(404).json({ message: 'League not found' });
    if (league.userId.toString() !== req.userId) return res.status(403).json({ message: 'Not the league owner' });
    return res.json(league);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to get league' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const league = await League.findById(req.params.id);
    if (!league) return res.status(404).json({ message: 'League not found' });
    if (league.userId.toString() !== req.userId) return res.status(403).json({ message: 'Not the league owner' });
    const { name, platform, totalBudget, rosterSlots, scoringCategories, benchSlots } = req.body;
    if (name != null) league.name = name;
    if (platform != null) league.platform = platform;
    if (totalBudget != null) league.totalBudget = Number(totalBudget);
    if (benchSlots != null) {
      league.benchSlots = parseBenchSlots(benchSlots, Number(league.benchSlots) || 6);
    }
    if (rosterSlots != null) league.rosterSlots = rosterSlots;
    if (scoringCategories != null) league.scoringCategories = scoringCategories;
    await league.save();
    return res.json(league);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to update league' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const league = await League.findById(req.params.id);
    if (!league) return res.status(404).json({ message: 'League not found' });
    if (league.userId.toString() !== req.userId) return res.status(403).json({ message: 'Not the league owner' });

    const [teamsResult, playersResult, draftHistoryResult] = await Promise.all([
      Team.deleteMany({ leagueId: league._id }),
      Player.deleteMany({ leagueId: league._id }),
      DraftHistory.deleteMany({ leagueId: league._id }),
    ]);

    await League.findByIdAndDelete(league._id);

    return res.json({
      message: 'League and associated resources deleted',
      deleted: {
        leagues: 1,
        teams: teamsResult.deletedCount ?? 0,
        players: playersResult.deletedCount ?? 0,
        draftHistory: draftHistoryResult.deletedCount ?? 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to delete league' });
  }
});

router.post('/:id/seed-players', async (req, res) => {
  try {
    const league = await League.findById(req.params.id);
    if (!league) return res.status(404).json({ message: 'League not found' });
    if (league.userId.toString() !== req.userId) return res.status(403).json({ message: 'Not the league owner' });
    const existing = await Player.countDocuments({ leagueId: league._id });
    if (existing > 0) return res.status(400).json({ message: 'League already has players; use Add Custom Player or re-seed only when empty' });
    const toInsert = MOCK_PLAYERS.map((p) => ({
      leagueId: league._id,
      name: p.name,
      mlbTeam: p.mlbTeam,
      eligiblePositions: p.eligiblePositions,
      projectedValue: p.projectedValue,
      projections: p.projections || {},
      adp: p.adp,
      isDrafted: false
    }));
    await Player.insertMany(toInsert);
    return res.json({ message: `Seeded ${toInsert.length} players`, count: toInsert.length });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Seed failed' });
  }
});

router.post('/:id/clear-player-pool', async (req, res) => {
  try {
    const league = await League.findById(req.params.id);
    if (!league) return res.status(404).json({ message: 'League not found' });
    if (league.userId.toString() !== req.userId) return res.status(403).json({ message: 'Not the league owner' });

    const [draftedCount, historyCount, hasRosteredPlayers] = await Promise.all([
      Player.countDocuments({ leagueId: league._id, isDrafted: true }),
      DraftHistory.countDocuments({ leagueId: league._id }),
      Team.exists({ leagueId: league._id, 'roster.0': { $exists: true } }),
    ]);

    if (draftedCount > 0 || historyCount > 0 || Boolean(hasRosteredPlayers)) {
      return res.status(400).json({
        message: 'Cannot clear player pool after keeper or draft picks exist.',
      });
    }

    const deleteResult = await Player.deleteMany({ leagueId: league._id });
    return res.json({
      message: 'Player pool cleared',
      deleted: deleteResult.deletedCount ?? 0,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to clear player pool' });
  }
});

module.exports = router;
