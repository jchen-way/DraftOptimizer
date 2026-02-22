const express = require('express');
const League = require('../models/League');
const Player = require('../models/Player');
const Team = require('../models/Team');
const DraftHistory = require('../models/DraftHistory');
const {
  normalizeMainRosterSlots,
  getMainSlotsLeft,
  getEligibleOpenPositions,
  areAllTeamsMainRostersFull,
  getTaxiSlotsLeft,
  getBenchSlots,
} = require('../utils/roster');
const { buildPostDraftAnalysis } = require('../utils/postDraftAnalysis');

const router = express.Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

async function ensureLeagueOwner(leagueId, userId) {
  const league = await League.findById(leagueId);
  if (!league) return { error: 404, message: 'League not found' };
  if (league.userId.toString() !== userId) return { error: 403, message: 'Not the league owner' };
  return { league };
}

function csvEscape(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getRemainingBudget(team) {
  const total = Number(team?.budget?.total ?? 0);
  const spent = Number(team?.budget?.spent ?? 0);
  const remaining = team?.budget?.remaining;
  return Number.isFinite(remaining) ? Number(remaining) : Math.max(0, total - spent);
}

function getTeamBidGuard(team, league) {
  const remaining = getRemainingBudget(team);
  const slotsLeft = getMainSlotsLeft(team, league);
  const reserveForMinimums = Math.max(0, slotsLeft - 1);
  const maxBid = Math.max(0, remaining - reserveForMinimums);
  return { remaining, slotsLeft, maxBid };
}

function isTaxiRoundComplete(teams, league) {
  const teamList = Array.isArray(teams) ? teams : [];
  if (!teamList.length) return false;
  if (league?.draftPhase !== 'TAXI') return false;
  const benchSlots = getBenchSlots(league);
  if (benchSlots <= 0) return false;
  return teamList.every((team) => getTaxiSlotsLeft(team, league) === 0);
}

router.post('/bid', async (req, res) => {
  try {
    const { playerId, teamId, amount } = req.body;
    if (!playerId || !teamId) {
      return res.status(400).json({ message: 'playerId and teamId are required' });
    }

    const [player, team] = await Promise.all([
      Player.findById(playerId),
      Team.findById(teamId)
    ]);
    if (!player) return res.status(404).json({ message: 'Player not found' });
    if (!team) return res.status(404).json({ message: 'Team not found' });
    if (team.leagueId.toString() !== player.leagueId.toString()) {
      return res.status(400).json({ message: 'Player and team must belong to the same league' });
    }
    const check = await ensureLeagueOwner(team.leagueId.toString(), req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });

    if (player.isDrafted) return res.status(400).json({ message: 'Player is already drafted' });
    const inTaxiRound = check.league?.draftPhase === 'TAXI';
    let resolvedAmount = 0;
    let resolvedPhase = 'MAIN';
    let resolvedPosition = 'UTIL';

    if (!inTaxiRound) {
      if (amount == null) {
        return res.status(400).json({ message: 'amount is required during main draft round' });
      }
      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount < 1) {
        return res.status(400).json({ message: 'amount must be at least 1' });
      }

      const bidGuard = getTeamBidGuard(team, check.league);
      if (bidGuard.slotsLeft <= 0) {
        return res.status(400).json({ message: 'Team main roster is already full for this round' });
      }

      const openEligiblePositions = getEligibleOpenPositions(
        team,
        check.league,
        player.eligiblePositions
      );
      if (openEligiblePositions.length === 0) {
        return res.status(400).json({
          message: 'No open roster slot is available for this player on the selected team.',
        });
      }
      if (parsedAmount > bidGuard.maxBid) {
        return res.status(400).json({
          message: `Maximum allowed bid is $${bidGuard.maxBid} with ${bidGuard.slotsLeft} roster spots left.`,
        });
      }

      resolvedAmount = parsedAmount;
      resolvedPhase = 'MAIN';
      resolvedPosition = openEligiblePositions[0];
    } else {
      const taxiSlotsLeft = getTaxiSlotsLeft(team, check.league);
      if (taxiSlotsLeft <= 0) {
        return res.status(400).json({ message: 'Team bench is already full for taxi round' });
      }

      resolvedAmount = 0;
      resolvedPhase = 'TAXI';
      resolvedPosition = 'BENCH';
    }

    player.isDrafted = true;
    player.draftedBy = teamId;
    player.draftedFor = resolvedAmount;
    player.draftPhase = resolvedPhase;
    player.activePosition = resolvedPosition;
    await player.save();

    if (!inTaxiRound) {
      team.budget.spent = (team.budget.spent || 0) + resolvedAmount;
    }
    team.roster = team.roster || [];
    team.roster.push({
      playerId: player._id,
      position: resolvedPosition,
      cost: resolvedAmount,
      draftPhase: resolvedPhase
    });
    await team.save();

    await DraftHistory.create({
      leagueId: team.leagueId,
      playerId: player._id,
      teamId: team._id,
      amount: resolvedAmount,
      phase: resolvedPhase
    });

    const updatedTeam = await Team.findById(teamId).populate('roster.playerId');
    return res.json({ team: updatedTeam, player });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Bid failed' });
  }
});

router.delete('/bid/last', async (req, res) => {
  try {
    const { leagueId } = req.query;
    if (!leagueId) return res.status(400).json({ message: 'leagueId query param is required' });
    const check = await ensureLeagueOwner(leagueId, req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });

    const last = await DraftHistory.findOne({ leagueId }).sort({ createdAt: -1 });
    if (!last) return res.status(404).json({ message: 'No draft history to undo' });
    if (check.league.keeperFinalized && last.phase === 'KEEPER') {
      return res.status(400).json({ message: 'Keeper entries are finalized and cannot be undone' });
    }

    const [player, team] = await Promise.all([
      Player.findById(last.playerId),
      Team.findById(last.teamId)
    ]);
    if (player) {
      player.isDrafted = false;
      player.draftedBy = undefined;
      player.draftedFor = undefined;
      player.draftPhase = undefined;
      player.activePosition = undefined;
      await player.save();
    }
    if (team) {
      team.budget.spent = Math.max(0, (team.budget.spent || 0) - last.amount);
      team.roster = (team.roster || []).filter(
        (s) => s.playerId && s.playerId.toString() !== last.playerId.toString()
      );
      await team.save();
    }
    await DraftHistory.findByIdAndDelete(last._id);
    return res.json({
      message: 'Last pick undone',
      success: true,
      undone: {
        playerId: last.playerId,
        teamId: last.teamId,
        amount: last.amount,
        phase: last.phase,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Undo failed' });
  }
});

router.post('/keeper', async (req, res) => {
  try {
    const { playerId, teamId, keeperPrice } = req.body;
    if (!playerId || !teamId || keeperPrice == null) {
      return res.status(400).json({ message: 'playerId, teamId and keeperPrice are required' });
    }
    const numAmount = Number(keeperPrice);
    if (isNaN(numAmount) || numAmount < 0) return res.status(400).json({ message: 'keeperPrice must be a non-negative number' });

    const [player, team] = await Promise.all([
      Player.findById(playerId),
      Team.findById(teamId)
    ]);
    if (!player) return res.status(404).json({ message: 'Player not found' });
    if (!team) return res.status(404).json({ message: 'Team not found' });
    if (team.leagueId.toString() !== player.leagueId.toString()) {
      return res.status(400).json({ message: 'Player and team must belong to the same league' });
    }
    const check = await ensureLeagueOwner(team.leagueId.toString(), req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });
    if (check.league.keeperFinalized) {
      return res.status(400).json({ message: 'Keeper period has been finalized' });
    }
    if (check.league.draftPhase === 'TAXI') {
      return res.status(400).json({ message: 'Cannot add keeper entries after taxi round has started' });
    }

    if (player.isDrafted) return res.status(400).json({ message: 'Player is already drafted' });
    const bidGuard = getTeamBidGuard(team, check.league);
    if (bidGuard.slotsLeft <= 0) {
      return res.status(400).json({ message: 'Team main roster is already full' });
    }

    const openEligiblePositions = getEligibleOpenPositions(
      team,
      check.league,
      player.eligiblePositions
    );
    if (openEligiblePositions.length === 0) {
      return res.status(400).json({
        message: 'No open roster slot is available for this player on the selected team.',
      });
    }
    if (numAmount > bidGuard.maxBid) {
      return res.status(400).json({
        message: `Maximum allowed keeper cost is $${bidGuard.maxBid} with ${bidGuard.slotsLeft} roster spots left.`,
      });
    }

    const firstPosition = openEligiblePositions[0];
    player.isDrafted = true;
    player.draftedBy = teamId;
    player.draftedFor = numAmount;
    player.draftPhase = 'KEEPER';
    player.activePosition = firstPosition;
    await player.save();

    team.budget.spent = (team.budget.spent || 0) + numAmount;
    team.roster = team.roster || [];
    team.roster.push({
      playerId: player._id,
      position: firstPosition,
      cost: numAmount,
      draftPhase: 'KEEPER'
    });
    await team.save();

    await DraftHistory.create({
      leagueId: team.leagueId,
      playerId: player._id,
      teamId: team._id,
      amount: numAmount,
      phase: 'KEEPER'
    });

    const updatedTeam = await Team.findById(teamId).populate('roster.playerId');
    return res.json({ team: updatedTeam, player });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Keeper failed' });
  }
});

router.put('/position', async (req, res) => {
  try {
    const { playerId, newPosition } = req.body;
    if (!playerId || !newPosition) return res.status(400).json({ message: 'playerId and newPosition are required' });
    const normalizedNewPosition = String(newPosition).trim().toUpperCase();
    if (!normalizedNewPosition) return res.status(400).json({ message: 'newPosition is required' });

    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ message: 'Player not found' });
    if (!player.isDrafted || !player.draftedBy) return res.status(400).json({ message: 'Player is not on a team' });
    const eligible = Array.isArray(player.eligiblePositions)
      ? player.eligiblePositions.map((position) => String(position).toUpperCase())
      : [];
    if (!eligible.includes(normalizedNewPosition)) return res.status(400).json({ message: 'newPosition must be in player eligiblePositions' });

    const team = await Team.findById(player.draftedBy);
    if (!team) return res.status(404).json({ message: 'Team not found' });
    const check = await ensureLeagueOwner(team.leagueId.toString(), req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });

    const roster = team.roster || [];
    const slot = roster.find((s) => s.playerId && s.playerId.toString() === playerId);
    if (!slot) return res.status(400).json({ message: 'Player not found on team roster' });
    if (slot.draftPhase === 'TAXI') {
      return res.status(400).json({ message: 'Taxi round players cannot be reassigned to main roster slots' });
    }
    if (slot.position === normalizedNewPosition) {
      const updatedTeamNoop = await Team.findById(team._id).populate('roster.playerId');
      return res.json({ team: updatedTeamNoop, player });
    }

    const slotConfig = normalizeMainRosterSlots(check.league?.rosterSlots);
    const maxSlotsForPosition = Math.max(0, Number(slotConfig[normalizedNewPosition] ?? 0));
    if (maxSlotsForPosition === 0) {
      return res.status(400).json({ message: 'Position is not part of this league roster configuration' });
    }
    const takenSlots = roster.filter(
      (s) => (
        s.position === normalizedNewPosition &&
        s.draftPhase !== 'TAXI' &&
        s.playerId &&
        s.playerId.toString() !== playerId
      )
    ).length;
    if (takenSlots >= maxSlotsForPosition) {
      return res.status(400).json({ message: 'No open slot available for selected position' });
    }

    slot.position = normalizedNewPosition;
    player.activePosition = normalizedNewPosition;
    await Promise.all([team.save(), player.save()]);

    const updatedTeam = await Team.findById(team._id).populate('roster.playerId');
    return res.json({ team: updatedTeam, player });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Position update failed' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const { leagueId } = req.query;
    if (!leagueId) return res.status(400).json({ message: 'leagueId query param is required' });
    const check = await ensureLeagueOwner(leagueId, req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });

    const history = await DraftHistory.find({ leagueId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('playerId')
      .populate('teamId')
      .lean();
    return res.json(history);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to get draft history' });
  }
});

router.post('/keepers/finalize', async (req, res) => {
  try {
    const { leagueId } = req.body || {};
    if (!leagueId) return res.status(400).json({ message: 'leagueId is required' });
    const check = await ensureLeagueOwner(leagueId, req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });

    if (!check.league.keeperFinalized) {
      check.league.keeperFinalized = true;
      check.league.keeperFinalizedAt = new Date();
      await check.league.save();
    }

    const [keeperHistory, teams] = await Promise.all([
      DraftHistory.find({ leagueId, phase: 'KEEPER' }).lean(),
      Team.find({ leagueId }).lean(),
    ]);

    const totalKeepers = keeperHistory.length;
    const totalKeeperSpend = keeperHistory.reduce((sum, pick) => sum + (pick.amount || 0), 0);
    const remainingBudgets = teams.map((team) => Number(team?.budget?.remaining ?? 0));
    const minRemainingBudget = remainingBudgets.length ? Math.min(...remainingBudgets) : 0;
    const maxRemainingBudget = remainingBudgets.length ? Math.max(...remainingBudgets) : 0;

    return res.json({
      message: 'Keeper period finalized',
      summary: {
        totalKeepers,
        totalKeeperSpend,
        minRemainingBudget,
        maxRemainingBudget,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to finalize keeper period' });
  }
});

router.post('/keepers/reopen', async (req, res) => {
  try {
    const { leagueId } = req.body || {};
    if (!leagueId) return res.status(400).json({ message: 'leagueId is required' });
    const check = await ensureLeagueOwner(leagueId, req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });

    const hasMainPicks = await DraftHistory.exists({ leagueId, phase: 'MAIN' });
    if (hasMainPicks) {
      return res.status(400).json({ message: 'Cannot reopen keepers after main draft picks have been logged' });
    }

    check.league.keeperFinalized = false;
    check.league.keeperFinalizedAt = undefined;
    await check.league.save();
    return res.json({ message: 'Keeper period reopened' });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to reopen keeper period' });
  }
});

router.post('/taxi/start', async (req, res) => {
  try {
    const { leagueId } = req.body || {};
    if (!leagueId) return res.status(400).json({ message: 'leagueId is required' });
    const check = await ensureLeagueOwner(leagueId, req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });

    if (check.league.draftPhase === 'TAXI') {
      return res.json({
        message: 'Taxi round is already active',
        draftPhase: 'TAXI',
        benchSlots: getBenchSlots(check.league),
      });
    }

    const teams = await Team.find({ leagueId }).lean();
    if (!teams.length) {
      return res.status(400).json({ message: 'Add at least one team before starting taxi round' });
    }
    if (!areAllTeamsMainRostersFull(teams, check.league)) {
      return res.status(400).json({
        message: 'Cannot start taxi round until every team fills its main roster.',
      });
    }

    const benchSlots = getBenchSlots(check.league);
    if (benchSlots <= 0) {
      return res.status(400).json({
        message: 'Bench slots are set to 0. Increase bench slots in league settings first.',
      });
    }

    check.league.draftPhase = 'TAXI';
    check.league.taxiRoundStartedAt = new Date();
    await check.league.save();

    return res.json({
      message: 'Taxi round started',
      draftPhase: check.league.draftPhase,
      benchSlots,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to start taxi round' });
  }
});

router.get('/post-analysis', async (req, res) => {
  try {
    const { leagueId } = req.query;
    if (!leagueId) return res.status(400).json({ message: 'leagueId query param is required' });
    const check = await ensureLeagueOwner(leagueId, req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });

    const teams = await Team.find({ leagueId }).lean();
    if (!teams.length) {
      return res.status(400).json({ message: 'Add at least one team before running post-draft analysis.' });
    }
    if (!areAllTeamsMainRostersFull(teams, check.league)) {
      return res.status(400).json({
        message: 'Post-draft analysis is available after every team fills the main draft roster.',
      });
    }
    if (!isTaxiRoundComplete(teams, check.league)) {
      return res.status(400).json({
        message: 'Post-draft analysis unlocks after taxi round is complete for all teams.',
      });
    }

    const [players, draftHistory] = await Promise.all([
      Player.find({ leagueId }).lean(),
      DraftHistory.find({ leagueId })
        .sort({ createdAt: 1 })
        .populate('playerId', 'name')
        .populate('teamId', 'ownerName teamName')
        .lean(),
    ]);

    const analysis = buildPostDraftAnalysis({
      league: check.league,
      teams,
      players,
      draftHistory,
    });
    return res.json(analysis);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to build post-draft analysis' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const { leagueId, format = 'csv' } = req.query;
    if (!leagueId) return res.status(400).json({ message: 'leagueId query param is required' });
    const check = await ensureLeagueOwner(leagueId, req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });

    const history = await DraftHistory.find({ leagueId })
      .sort({ createdAt: 1 })
      .populate('playerId')
      .populate('teamId')
      .lean();

    const rows = history.map((pick, index) => ({
      pickNumber: index + 1,
      timestamp: new Date(pick.createdAt).toISOString(),
      phase: pick.phase,
      player: typeof pick.playerId === 'object' ? pick.playerId?.name ?? '' : String(pick.playerId || ''),
      team:
        typeof pick.teamId === 'object'
          ? pick.teamId?.teamName ?? pick.teamId?.ownerName ?? ''
          : String(pick.teamId || ''),
      amount: pick.amount ?? 0,
    }));

    if (String(format).toLowerCase() === 'json') {
      return res.json({
        leagueId,
        generatedAt: new Date().toISOString(),
        totalPicks: rows.length,
        picks: rows,
      });
    }

    const header = ['Pick #', 'Timestamp', 'Phase', 'Player', 'Team', 'Amount'];
    const csvLines = [
      header.join(','),
      ...rows.map((row) => [
        csvEscape(row.pickNumber),
        csvEscape(row.timestamp),
        csvEscape(row.phase),
        csvEscape(row.player),
        csvEscape(row.team),
        csvEscape(row.amount),
      ].join(',')),
    ];
    const csv = csvLines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="draft-log-${leagueId}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to export draft log' });
  }
});

module.exports = router;
