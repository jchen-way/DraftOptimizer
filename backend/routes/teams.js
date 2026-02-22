const express = require('express');
const League = require('../models/League');
const Team = require('../models/Team');

const router = express.Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

async function ensureLeagueOwner(leagueId, userId) {
  const league = await League.findById(leagueId);
  if (!league) return { error: 404, message: 'League not found' };
  if (league.userId.toString() !== userId) return { error: 403, message: 'Not the league owner' };
  return { league };
}

router.get('/', async (req, res) => {
  try {
    const { leagueId } = req.query;
    if (!leagueId) return res.status(400).json({ message: 'leagueId query param is required' });
    const check = await ensureLeagueOwner(leagueId, req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });
    const teams = await Team.find({ leagueId }).sort({ teamName: 1 });
    return res.json(teams);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to list teams' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { leagueId, ownerName, teamName, budget } = req.body;
    if (!leagueId || !ownerName || !teamName || budget == null) {
      return res.status(400).json({ message: 'leagueId, ownerName, teamName and budget.total are required' });
    }
    const total = typeof budget === 'object' && budget !== null ? budget.total : budget;
    if (typeof total !== 'number' || total < 0) return res.status(400).json({ message: 'budget.total must be a number' });
    const check = await ensureLeagueOwner(leagueId, req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });
    const team = await Team.create({
      leagueId,
      ownerName,
      teamName,
      budget: { total, spent: 0, remaining: total },
      roster: []
    });
    return res.status(201).json(team);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to create team' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found' });
    const check = await ensureLeagueOwner(team.leagueId.toString(), req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });
    const { ownerName, teamName, isMyTeam, budget } = req.body;
    if (ownerName != null) team.ownerName = ownerName;
    if (teamName != null) team.teamName = teamName;
    if (typeof isMyTeam === 'boolean') team.isMyTeam = isMyTeam;
    if (budget != null && typeof budget === 'object') {
      if (typeof budget.total === 'number') team.budget.total = budget.total;
      if (typeof budget.spent === 'number') team.budget.spent = budget.spent;
    }
    await team.save();
    return res.json(team);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to update team' });
  }
});

router.get('/:id/roster', async (req, res) => {
  try {
    const team = await Team.findById(req.params.id).populate('roster.playerId');
    if (!team) return res.status(404).json({ message: 'Team not found' });
    const check = await ensureLeagueOwner(team.leagueId.toString(), req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });
    return res.json(team);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to get roster' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found' });
    const check = await ensureLeagueOwner(team.leagueId.toString(), req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });

    if ((team.roster || []).length > 0) {
      return res.status(400).json({ message: 'Cannot delete a team after players have been assigned' });
    }

    await Team.findByIdAndDelete(team._id);
    return res.json({ message: 'Team deleted' });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to delete team' });
  }
});

module.exports = router;
