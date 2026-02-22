function toNumber(value) {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const cleaned = String(value).replace(/[$,%]/g, '').trim();
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 1;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length;
  const deviation = Math.sqrt(variance);
  return deviation > 0 ? deviation : 1;
}

const CATEGORY_CANONICAL = {
  RUNS: 'R',
  HOME_RUNS: 'HR',
  STOLEN_BASES: 'SB',
  BATTING_AVG: 'AVG',
  BA: 'AVG',
  WINS: 'W',
  SAVES: 'SV',
  STRIKEOUTS: 'K',
  SO: 'K',
};

const CATEGORY_ALIASES = {
  R: ['R', 'RUNS'],
  HR: ['HR', 'HOME_RUNS'],
  RBI: ['RBI'],
  SB: ['SB', 'STOLEN_BASES'],
  AVG: ['AVG', 'BA', 'BATTING_AVG'],
  OBP: ['OBP'],
  SLG: ['SLG'],
  OPS: ['OPS'],
  W: ['W', 'WINS'],
  SV: ['SV', 'SAVES'],
  K: ['K', 'SO', 'STRIKEOUTS'],
  ERA: ['ERA'],
  WHIP: ['WHIP'],
};

function normalizeCategory(rawCategory) {
  const upper = String(rawCategory || '').trim().toUpperCase();
  if (!upper) return '';
  return CATEGORY_CANONICAL[upper] || upper;
}

const DEFAULT_ROSTER_SLOTS = {
  C: 2,
  '1B': 1,
  '2B': 1,
  '3B': 1,
  SS: 1,
  OF: 5,
  UTIL: 1,
  P: 9,
};

function normalizeRosterSlots(rosterSlots) {
  const source = rosterSlots && typeof rosterSlots === 'object' ? rosterSlots : {};
  const normalized = {};
  let hasPositive = false;

  for (const [position, fallback] of Object.entries(DEFAULT_ROSTER_SLOTS)) {
    const parsed = Number(source[position]);
    const count = Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    normalized[position] = count;
    if (count > 0) hasPositive = true;
  }

  return hasPositive ? normalized : { ...DEFAULT_ROSTER_SLOTS };
}

function buildDemandByPosition(slotConfig, teams, fallbackTeamCount) {
  const demandByPos = {};
  const teamList = Array.isArray(teams) ? teams : [];
  const useTeamNeeds = teamList.length > 0;
  const safeFallbackTeamCount = Math.max(1, Number(fallbackTeamCount) || 1);

  for (const [position, rawSlots] of Object.entries(slotConfig)) {
    const slotCount = Number(rawSlots);
    if (!Number.isFinite(slotCount) || slotCount <= 0) continue;

    if (!useTeamNeeds) {
      demandByPos[position] = safeFallbackTeamCount * slotCount;
      continue;
    }

    const missingSlots = teamList.reduce((sum, team) => {
      const roster = Array.isArray(team?.roster) ? team.roster : [];
      const filled = roster.reduce((count, slot) => (
        slot?.position === position ? count + 1 : count
      ), 0);
      return sum + Math.max(0, slotCount - filled);
    }, 0);

    demandByPos[position] = missingSlots;
  }

  return demandByPos;
}

function isPitcher(player) {
  const eligible = Array.isArray(player?.eligiblePositions) ? player.eligiblePositions : [];
  return eligible.includes('P');
}

function getNumericProjection(projections, keys) {
  if (!projections || typeof projections !== 'object' || Array.isArray(projections)) return undefined;
  const aliasKeys = [];
  for (const key of keys) {
    const rawKey = String(key || '').trim().toUpperCase();
    const normalizedKey = normalizeCategory(rawKey);
    // Accept both canonical names (e.g., W) and common aliases (e.g., WINS).
    const aliases = CATEGORY_ALIASES[normalizedKey] || [normalizedKey];
    for (const alias of aliases) {
      if (!alias) continue;
      aliasKeys.push(alias);
    }
    aliasKeys.push(rawKey);
  }

  const uniqueKeys = Array.from(new Set(aliasKeys));
  for (const key of uniqueKeys) {
    if (projections[key] == null) continue;
    const parsed = toNumber(projections[key]);
    if (parsed != null) return parsed;
  }
  return undefined;
}

function estimateInjuryRisk(player) {
  const projections = player?.projections;
  const riskSamples = [];
  const pitcher = isPitcher(player);
  const baseline = pitcher ? 0.08 : 0.045;
  riskSamples.push(baseline);

  const directRisk = getNumericProjection(projections, [
    'INJURY_RISK',
    'INJURY_RISK_PCT',
    'INJURY_PROB',
    'INJURY_PROBABILITY',
    'RISK',
  ]);
  if (directRisk != null) {
    const normalized = directRisk > 1 ? directRisk / 100 : directRisk;
    riskSamples.push(clamp(normalized, 0, 0.75));
  }

  const previousMissedGames = getNumericProjection(projections, [
    'GAMES_MISSED_PREV',
    'GAMES_MISSED',
    'MISSED_G',
    'INJURED_GAMES',
    'IL_G',
  ]);
  if (previousMissedGames != null) {
    riskSamples.push(clamp(previousMissedGames / 162, 0, 0.65));
  }

  const previousIlDays = getNumericProjection(projections, [
    'IL_DAYS_PREV',
    'IL_DAYS',
    'DAYS_ON_IL',
    'INJURY_DAYS',
  ]);
  if (previousIlDays != null) {
    riskSamples.push(clamp(previousIlDays / 190, 0, 0.65));
  }

  const projectedGames = getNumericProjection(projections, ['G', 'GP', 'GAMES']);
  if (projectedGames != null) {
    const expected = pitcher ? 30 : 155;
    const maxGap = pitcher ? 30 : 155;
    riskSamples.push(clamp((expected - projectedGames) / maxGap, 0, 0.4));
  } else if (!pitcher) {
    const projectedRuns = getNumericProjection(projections, ['R', 'RUNS']);
    const projectedRbi = getNumericProjection(projections, ['RBI']);
    const projectedHr = getNumericProjection(projections, ['HR', 'HOME_RUNS']);
    const projectedSb = getNumericProjection(projections, ['SB', 'STOLEN_BASES']);
    if (
      projectedRuns != null ||
      projectedRbi != null ||
      projectedHr != null ||
      projectedSb != null
    ) {
      const hitterVolume =
        (projectedRuns ?? 0) +
        (projectedRbi ?? 0) +
        ((projectedHr ?? 0) * 1.8) +
        ((projectedSb ?? 0) * 0.7);
      const impliedGames = clamp(78 + (hitterVolume * 0.33), 70, 162);
      riskSamples.push(clamp((155 - impliedGames) / 155, 0, 0.34));
    }
  }

  const projectedInnings = getNumericProjection(projections, ['IP', 'INNINGS', 'IP_PROJ']);
  if (pitcher && projectedInnings != null) {
    riskSamples.push(clamp((175 - projectedInnings) / 175, 0, 0.35));
  } else if (pitcher) {
    const projectedWins = getNumericProjection(projections, ['W', 'WINS']);
    const projectedKs = getNumericProjection(projections, ['K', 'SO', 'STRIKEOUTS']);
    const projectedSaves = getNumericProjection(projections, ['SV', 'SAVES']);
    if (projectedWins != null || projectedKs != null || projectedSaves != null) {
      const inferredFromKs = projectedKs != null ? projectedKs / 1.02 : undefined;
      const inferredFromWins = projectedWins != null ? projectedWins * 13 : undefined;
      const inferredFromSaves = projectedSaves != null ? projectedSaves * 2.2 : undefined;
      const inferredSamples = [inferredFromKs, inferredFromWins, inferredFromSaves]
        .filter((value) => value != null);
      if (inferredSamples.length) {
        const inferredInnings = mean(inferredSamples);
        const closerLike = (projectedSaves ?? 0) >= 18;
        const roleExpectedInnings = closerLike ? 68 : 165;
        riskSamples.push(clamp((roleExpectedInnings - inferredInnings) / roleExpectedInnings, 0, 0.34));
      }
    }
  }

  const age = getNumericProjection(projections, ['AGE', 'PLAYER_AGE']);
  if (age != null && age > 31) {
    riskSamples.push(clamp((age - 31) * 0.012, 0, 0.14));
  }

  return clamp(mean(riskSamples), 0.03, 0.5);
}

function getCategoryDirections(scoringCategories) {
  const categories = Array.isArray(scoringCategories) && scoringCategories.length
    ? scoringCategories
    : ['HR', 'RBI', 'SB', 'AVG', 'W', 'SV', 'K', 'ERA', 'WHIP'];
  const all = Array.from(new Set(
    categories
      .map((category) => normalizeCategory(category))
      .filter(Boolean)
  ));
  const lowerIsBetter = new Set(['ERA', 'WHIP']);
  return {
    categories: all,
    directionByCategory: Object.fromEntries(
      all.map((category) => [category, lowerIsBetter.has(category) ? -1 : 1])
    ),
  };
}

function buildCategoryStats(players, categories) {
  const byCategory = Object.fromEntries(
    categories.map((category) => [category, []])
  );
  for (const player of players) {
    for (const category of categories) {
      const value = getNumericProjection(player?.projections, [category]);
      if (value != null) {
        byCategory[category].push(value);
      }
    }
  }
  return Object.fromEntries(
    categories.map((category) => {
      const values = byCategory[category];
      return [category, { mean: mean(values), std: stdDev(values), count: values.length }];
    })
  );
}

function buildPositionScarcityFactors(scoreRows, slotConfig, demandInputByPos) {
  const relevantPositions = Object.keys(slotConfig).filter((pos) => Number(slotConfig[pos]) > 0);
  if (!relevantPositions.length) return {};

  const countPressureByPos = {};
  const demandByPos = {};
  const supplyByPos = {};
  const qualityDropByPos = {};
  for (const position of relevantPositions) {
    const demand = Number(demandInputByPos?.[position] ?? 0);
    const eligibleRows = scoreRows.filter((row) =>
      Array.isArray(row?.player?.eligiblePositions) && row.player.eligiblePositions.includes(position)
    );
    const supply = eligibleRows.length;
    demandByPos[position] = demand;
    supplyByPos[position] = supply;
    countPressureByPos[position] = demand > 0 ? demand / Math.max(1, supply) : 0;

    if (supply === 0) {
      qualityDropByPos[position] = 0;
      continue;
    }

    const sortedScores = eligibleRows
      .map((row) => Number(row.baseScore ?? 0))
      .sort((a, b) => b - a);
    const starterCutoff = Math.max(1, Math.min(sortedScores.length, demand || 1));
    const eliteWindowSize = Math.max(1, Math.min(5, starterCutoff));
    const eliteWindow = sortedScores.slice(0, eliteWindowSize);
    const replacementStart = Math.max(0, Math.min(sortedScores.length - 1, starterCutoff - 1));
    const replacementWindow = sortedScores.slice(
      replacementStart,
      Math.min(sortedScores.length, replacementStart + 4)
    );
    const eliteMean = mean(eliteWindow);
    const replacementMean = mean(replacementWindow.length ? replacementWindow : [sortedScores[sortedScores.length - 1]]);
    qualityDropByPos[position] = Math.max(0, eliteMean - replacementMean);
  }

  const countPressures = Object.values(countPressureByPos).filter((ratio) => ratio > 0);
  const countBaseline = countPressures.length ? mean(countPressures) : 1;
  const qualityDrops = Object.values(qualityDropByPos).filter((drop) => drop > 0);
  const qualityBaseline = qualityDrops.length ? mean(qualityDrops) : 1;
  const hasQualitySignal = qualityDrops.length > 0;

  const factors = {};
  for (const position of relevantPositions) {
    const normalizedCount = countBaseline > 0
      ? (countPressureByPos[position] || 0) / countBaseline
      : 1;
    const normalizedQuality = hasQualitySignal && qualityBaseline > 0
      ? (qualityDropByPos[position] || 0) / qualityBaseline
      : 1;
    const compositeScarcity = (normalizedCount * 0.62) + (normalizedQuality * 0.38);
    const demand = Number(demandByPos[position] || 0);
    const supply = Number(supplyByPos[position] || 0);
    const shortageRate = demand > 0
      ? clamp((demand - supply) / demand, 0, 1)
      : 0;
    const thinSupplyBoost = supply <= 2 ? (3 - supply) * 0.08 : 0;
    const scarcityBoost = 1 + (shortageRate * 0.35) + thinSupplyBoost;
    factors[position] = clamp((1 + ((compositeScarcity - 1) * 0.26)) * scarcityBoost, 0.78, 1.65);
  }
  return factors;
}

function buildValuationMap(players, league, teamCount, teams = []) {
  const playerList = Array.isArray(players) ? players : [];
  if (!playerList.length) return new Map();

  const availablePlayers = playerList.filter((player) => !player?.isDrafted);
  const valuationPopulation = availablePlayers.length > 0 ? availablePlayers : playerList;
  const slotConfig = normalizeRosterSlots(league?.rosterSlots);
  const demandByPosition = buildDemandByPosition(slotConfig, teams, teamCount);

  const { categories, directionByCategory } = getCategoryDirections(league?.scoringCategories);
  const categoryStats = buildCategoryStats(valuationPopulation, categories);
  const adpValues = valuationPopulation
    .map((player) => toNumber(player?.adp))
    .filter((value) => value != null);
  const adpMean = mean(adpValues);
  const adpStd = stdDev(adpValues);

  const scoreRows = playerList.map((player) => {
    const categoryZScores = [];
    for (const category of categories) {
      const value = getNumericProjection(player?.projections, [category]);
      if (value == null) continue;
      const stats = categoryStats[category];
      if (!stats || stats.count < 2) continue;
      const direction = directionByCategory[category] ?? 1;
      categoryZScores.push(((value - stats.mean) / stats.std) * direction);
    }

    const categoryScore = categoryZScores.length
      ? mean(categoryZScores)
      : 0;
    const projectionCoverage = categories.length
      ? categoryZScores.length / categories.length
      : 0;
    const coverageFactor = clamp(0.7 + (projectionCoverage * 0.3), 0.7, 1);
    const adp = toNumber(player?.adp);
    const adpSignal = adp != null ? ((adpMean - adp) / adpStd) : 0;
    const rawScore = (categoryScore * coverageFactor) + (adpSignal * 0.45);
    const injuryRisk = estimateInjuryRisk(player);
    const baseScore = rawScore * (1 - injuryRisk);

    return { player, categoryScore, adpSignal, injuryRisk, baseScore };
  });

  const valuationPopulationIds = new Set(valuationPopulation.map((player) => String(player._id)));
  const scarcityPopulationRows = scoreRows.filter((row) =>
    valuationPopulationIds.has(String(row.player?._id))
  );
  const positionScarcity = buildPositionScarcityFactors(
    scarcityPopulationRows,
    slotConfig,
    demandByPosition
  );

  const adjustedRows = scoreRows.map((row) => {
    const eligible = Array.isArray(row?.player?.eligiblePositions) ? row.player.eligiblePositions : [];
    const scarcityFactor = eligible.length
      ? Math.max(...eligible.map((pos) => positionScarcity[pos] ?? 1))
      : 1;
    const adjustedScore = row.baseScore * scarcityFactor;
    return { ...row, scarcityFactor, adjustedScore };
  });

  const adjustedScores = adjustedRows.map((row) => row.adjustedScore);
  const minScore = Math.min(...adjustedScores);
  const maxScore = Math.max(...adjustedScores);
  const range = Math.max(0.0001, maxScore - minScore);
  const topCap = clamp(Math.round((Number(league?.totalBudget) || 260) * 0.24), 35, 75);

  const valuationMap = new Map();
  for (const row of adjustedRows) {
    const normalized = clamp((row.adjustedScore - minScore) / range, 0, 1);
    const shaped = normalized ** 1.3;
    const projectedValue = Math.max(1, Math.round(1 + (shaped * (topCap - 1))));
    const eligible = Array.isArray(row?.player?.eligiblePositions) ? row.player.eligiblePositions : [];
    const positionFactors = Object.fromEntries(
      eligible.map((position) => [position, Number((positionScarcity[position] ?? 1).toFixed(3))])
    );
    valuationMap.set(String(row.player._id), {
      projectedValue,
      valuation: {
        modelVersion: 'stats-v5',
        categoryScore: Number(row.categoryScore.toFixed(3)),
        adpSignal: Number(row.adpSignal.toFixed(3)),
        injuryRiskPct: Number((row.injuryRisk * 100).toFixed(1)),
        scarcityFactor: Number(row.scarcityFactor.toFixed(3)),
        positionFactors,
      },
    });
  }

  return valuationMap;
}

module.exports = { buildValuationMap };
