const express = require('express');
const League = require('../models/League');
const Player = require('../models/Player');
const Team = require('../models/Team');
const { buildValuationMap } = require('../utils/valuation');

const router = express.Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

async function ensureLeagueOwner(leagueId, userId) {
  const league = await League.findById(leagueId);
  if (!league) return { error: 404, message: 'League not found' };
  if (league.userId.toString() !== userId) return { error: 403, message: 'Not the league owner' };
  return { league };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseNumeric(value) {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const cleaned = String(value).replace(/[$,%]/g, '').trim();
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function normalizePositions(raw) {
  const POSITION_ALIAS = {
    SP: 'P',
    RP: 'P',
    LF: 'OF',
    CF: 'OF',
    RF: 'OF',
    DH: 'UTIL',
  };
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[\s,;/|]+/)
      : [];
  const normalized = values
    .map((value) => String(value).trim().toUpperCase())
    .filter(Boolean)
    .map((value) => POSITION_ALIAS[value] || value);
  if (normalized.length === 0) return ['UTIL'];
  return Array.from(new Set(normalized));
}

function normalizeProjectionMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value)
    .map(([key, rawVal]) => {
      const normalizedKey = String(key).trim();
      if (!normalizedKey) return null;
      if (rawVal == null || rawVal === '') return null;
      const numeric = parseNumeric(rawVal);
      return [normalizedKey, numeric != null ? numeric : String(rawVal).trim()];
    })
    .filter(Boolean);
  return Object.fromEntries(entries);
}

function normalizeImportPlayer(rawPlayer) {
  if (!rawPlayer || typeof rawPlayer !== 'object') return null;
  const rawName = String(rawPlayer.name ?? '').trim();
  if (!rawName) return null;

  const projectedValue = parseNumeric(rawPlayer.projectedValue);
  const adp = parseNumeric(rawPlayer.adp);
  const normalized = {
    name: rawName,
    mlbTeam: String(rawPlayer.mlbTeam ?? '').trim().toUpperCase(),
    eligiblePositions: normalizePositions(rawPlayer.eligiblePositions),
    projectedValue,
    adp,
    projections: normalizeProjectionMap(rawPlayer.projections),
  };
  return normalized;
}

function getPlayerDedupeKey({ name, mlbTeam }) {
  return `${String(name || '').trim().toLowerCase()}::${String(mlbTeam || '').trim().toUpperCase()}`;
}

router.get('/', async (req, res) => {
  try {
    const { leagueId, q, position, drafted, limit } = req.query;
    if (!leagueId) return res.status(400).json({ message: 'leagueId query param is required' });
    const check = await ensureLeagueOwner(leagueId, req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });
    const filter = { leagueId };
    if (q && typeof q === 'string' && q.trim()) {
      filter.name = { $regex: escapeRegex(q.trim()), $options: 'i' };
    }
    if (position && typeof position === 'string' && position.trim()) {
      filter.eligiblePositions = position.trim();
    }
    if (drafted === 'false' || drafted === false) {
      filter.isDrafted = false;
    } else if (drafted === 'true' || drafted === true) {
      filter.isDrafted = true;
    }
    const numericLimit = Math.min(Math.max(Number(limit) || 1000, 1), 2000);
    const playerSelect = 'name mlbTeam eligiblePositions isDrafted draftedBy draftedFor draftPhase activePosition projectedValue projections adp leagueId';
    const [leaguePlayers, filteredPlayers, teams] = await Promise.all([
      Player.find({ leagueId }).select(playerSelect).lean(),
      Player.find(filter)
        .select(playerSelect)
        .limit(numericLimit)
        .lean(),
      Team.find({ leagueId }).select('roster.position').lean(),
    ]);

    const teamCount = Array.isArray(teams) ? teams.length : 0;
    const valuationMap = buildValuationMap(leaguePlayers, check.league, teamCount, teams);
    const players = filteredPlayers.map((player) => {
      const derived = valuationMap.get(String(player._id));
      if (!derived) return player;
      return {
        ...player,
        projectedValue: derived.projectedValue,
        valuation: derived.valuation,
      };
    }).sort((a, b) => {
      const draftedDelta = Number(a.isDrafted) - Number(b.isDrafted);
      if (draftedDelta !== 0) return draftedDelta;
      const valueDelta = Number(b.projectedValue ?? 0) - Number(a.projectedValue ?? 0);
      if (valueDelta !== 0) return valueDelta;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''));
    });

    return res.json(players);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to list players' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ message: 'Player not found' });
    const check = await ensureLeagueOwner(player.leagueId.toString(), req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });
    return res.json(player);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to get player' });
  }
});

router.post('/custom', async (req, res) => {
  try {
    const { leagueId, name, mlbTeam, eligiblePositions, projectedValue } = req.body;
    if (!leagueId || !name) return res.status(400).json({ message: 'leagueId and name are required' });
    const check = await ensureLeagueOwner(leagueId, req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });

    const normalizedPositions = Array.isArray(eligiblePositions)
      ? eligiblePositions
          .map((pos) => String(pos).trim().toUpperCase())
          .filter(Boolean)
      : [];
    if (normalizedPositions.length === 0) {
      return res.status(400).json({ message: 'At least one eligible position is required' });
    }
    const numericProjectedValue = projectedValue != null ? Number(projectedValue) : undefined;
    if (projectedValue != null && Number.isNaN(numericProjectedValue)) {
      return res.status(400).json({ message: 'projectedValue must be a number' });
    }

    const player = await Player.create({
      leagueId,
      name: String(name).trim(),
      mlbTeam: mlbTeam != null ? String(mlbTeam) : '',
      eligiblePositions: normalizedPositions,
      projectedValue: numericProjectedValue,
      isDrafted: false
    });
    return res.status(201).json(player);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to add custom player' });
  }
});

router.post('/import', async (req, res) => {
  try {
    const { leagueId, players } = req.body || {};
    if (!leagueId) return res.status(400).json({ message: 'leagueId is required' });
    if (!Array.isArray(players)) return res.status(400).json({ message: 'players must be an array' });
    if (players.length === 0) return res.status(400).json({ message: 'players array cannot be empty' });
    if (players.length > 3000) {
      return res.status(400).json({ message: 'players array is too large (max 3000 rows per import)' });
    }

    const check = await ensureLeagueOwner(leagueId, req.userId);
    if (check.error) return res.status(check.error).json({ message: check.message });

    const existingKeys = new Set();
    const existingPlayers = await Player.find({ leagueId }).select('name mlbTeam').lean();
    for (const existingPlayer of existingPlayers) {
      existingKeys.add(getPlayerDedupeKey(existingPlayer));
    }

    const toInsert = [];
    let skippedCount = 0;
    for (const rawPlayer of players) {
      const normalizedPlayer = normalizeImportPlayer(rawPlayer);
      if (!normalizedPlayer) {
        skippedCount += 1;
        continue;
      }
      const dedupeKey = getPlayerDedupeKey(normalizedPlayer);
      if (existingKeys.has(dedupeKey)) {
        skippedCount += 1;
        continue;
      }
      existingKeys.add(dedupeKey);
      toInsert.push({
        leagueId,
        ...normalizedPlayer,
        isDrafted: false,
      });
    }

    if (toInsert.length === 0) {
      return res.status(400).json({
        message: 'No valid players to import after validation and duplicate filtering.',
      });
    }

    await Player.insertMany(toInsert, { ordered: false });
    return res.status(201).json({
      message: `Imported ${toInsert.length} player${toInsert.length === 1 ? '' : 's'}.`,
      importedCount: toInsert.length,
      skippedCount,
      totalReceived: players.length,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to import players' });
  }
});

module.exports = router;
