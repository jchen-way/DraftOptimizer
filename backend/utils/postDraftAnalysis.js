function toNumber(value) {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const cleaned = String(value).replace(/[$,%]/g, '').trim();
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
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

const DEFAULT_CATEGORIES = ['HR', 'RBI', 'SB', 'AVG', 'W', 'SV', 'K', 'ERA', 'WHIP'];
const LOWER_IS_BETTER = new Set(['ERA', 'WHIP']);
const RATE_CATEGORIES = new Set(['AVG', 'OBP', 'SLG', 'OPS', 'ERA', 'WHIP']);
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

function normalizeCategories(input) {
  if (!Array.isArray(input) || input.length === 0) return [...DEFAULT_CATEGORIES];
  const seen = new Set();
  const normalized = [];
  for (const raw of input) {
    const category = normalizeCategory(raw);
    if (!category || seen.has(category)) continue;
    seen.add(category);
    normalized.push(category);
  }
  return normalized.length > 0 ? normalized : [...DEFAULT_CATEGORIES];
}

function getCategoryDirection(category) {
  return LOWER_IS_BETTER.has(category) ? -1 : 1;
}

function getProjectionValue(projections, category) {
  if (!projections || typeof projections !== 'object' || Array.isArray(projections)) return undefined;
  const rawCategory = String(category || '').trim().toUpperCase();
  const normalizedCategory = normalizeCategory(rawCategory);
  const aliases = [
    ...(CATEGORY_ALIASES[normalizedCategory] || []),
    normalizedCategory,
    rawCategory,
  ].filter(Boolean);
  const uniqueAliases = Array.from(new Set(aliases));
  for (const key of uniqueAliases) {
    const parsed = toNumber(projections[key]);
    if (parsed != null) return parsed;
  }
  return undefined;
}

function formatCategoryValue(category, value) {
  if (!Number.isFinite(value)) return 0;
  if (RATE_CATEGORIES.has(category)) return Number(value.toFixed(3));
  return Number(value.toFixed(1));
}

function buildTeamRosterRows(team, playersById, categories) {
  const rows = [];
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  for (const slot of roster) {
    if (!slot || !slot.playerId) continue;
    const playerId = String(slot.playerId);
    const player = playersById.get(playerId);
    if (!player) continue;
    const row = {
      teamId: String(team._id),
      ownerName: team.ownerName,
      teamName: team.teamName,
      playerId,
      playerName: player.name || 'Unknown Player',
      mlbTeam: player.mlbTeam || '',
      rosterPosition: String(slot.position || '').toUpperCase(),
      draftPhase: String(slot.draftPhase || '').toUpperCase() || 'MAIN',
      cost: Number(slot.cost || 0),
      projectedValue: Number(player.projectedValue || 0),
      eligiblePositions: Array.isArray(player.eligiblePositions)
        ? player.eligiblePositions.join(', ')
        : '',
    };
    for (const category of categories) {
      const value = getProjectionValue(player.projections, category);
      row[category] = value != null ? formatCategoryValue(category, value) : '';
    }
    rows.push(row);
  }
  return rows;
}

function buildTeamCategoryTotals(teamRosterRows, categories) {
  const totals = {};
  for (const category of categories) {
    const values = teamRosterRows
      .map((row) => toNumber(row[category]))
      .filter((value) => value != null);
    if (!values.length) {
      totals[category] = 0;
      continue;
    }
    // Rate categories are averaged across rostered players while counting stats are summed.
    const aggregate = RATE_CATEGORIES.has(category)
      ? mean(values)
      : values.reduce((sum, value) => sum + value, 0);
    totals[category] = formatCategoryValue(category, aggregate);
  }
  return totals;
}

function buildTeamSummaries(teams, playersById, categories) {
  return teams.map((team) => {
    const rosterRows = buildTeamRosterRows(team, playersById, categories);
    const categoryTotals = buildTeamCategoryTotals(rosterRows, categories);
    return {
      teamId: String(team._id),
      ownerName: team.ownerName || '',
      teamName: team.teamName || '',
      isMyTeam: Boolean(team.isMyTeam),
      budgetRemaining: Number(team?.budget?.remaining ?? 0),
      rosterSize: rosterRows.length,
      rosterRows,
      categoryTotals,
    };
  });
}

function categoryComparison(myValue, oppValue, direction) {
  if (!Number.isFinite(myValue) && !Number.isFinite(oppValue)) return 'T';
  if (!Number.isFinite(myValue)) return 'L';
  if (!Number.isFinite(oppValue)) return 'W';
  const epsilon = direction === -1 ? 0.001 : 0.01;
  const delta = (myValue - oppValue) * direction;
  if (Math.abs(delta) <= epsilon) return 'T';
  return delta > 0 ? 'W' : 'L';
}

function buildMatchupOutlook(mySummary, teamSummaries, categories) {
  if (!mySummary) return [];
  return teamSummaries
    .filter((summary) => summary.teamId !== mySummary.teamId)
    .map((opponent) => {
      const winningCategories = [];
      const losingCategories = [];
      let wins = 0;
      let losses = 0;
      let ties = 0;

      for (const category of categories) {
        const direction = getCategoryDirection(category);
        const outcome = categoryComparison(
          Number(mySummary.categoryTotals[category]),
          Number(opponent.categoryTotals[category]),
          direction
        );
        if (outcome === 'W') {
          wins += 1;
          winningCategories.push(category);
        } else if (outcome === 'L') {
          losses += 1;
          losingCategories.push(category);
        } else {
          ties += 1;
        }
      }

      const projectedResult = wins > losses
        ? 'Likely win'
        : losses > wins
          ? 'Likely loss'
          : 'Toss-up';

      return {
        opponentTeamId: opponent.teamId,
        opponentOwnerName: opponent.ownerName,
        opponentTeamName: opponent.teamName,
        projectedResult,
        categoryRecord: { wins, losses, ties },
        winningCategories: winningCategories.slice(0, 4),
        losingCategories: losingCategories.slice(0, 4),
      };
    })
    .sort((a, b) => {
      const diffA = a.categoryRecord.wins - a.categoryRecord.losses;
      const diffB = b.categoryRecord.wins - b.categoryRecord.losses;
      return diffB - diffA;
    });
}

function buildStrengthWeaknessSummary(mySummary, teamSummaries, categories) {
  if (!mySummary) {
    return {
      strengths: [],
      weaknesses: [],
      summaryText: 'Set one team as "My Team" to generate strengths and weaknesses.',
    };
  }

  const edges = categories.map((category) => {
    const direction = getCategoryDirection(category);
    const allValues = teamSummaries.map((team) => Number(team.categoryTotals[category] ?? 0));
    const baseline = mean(allValues);
    const deviation = stdDev(allValues);
    const myValue = Number(mySummary.categoryTotals[category] ?? 0);
    const zScore = ((myValue - baseline) / deviation) * direction;
    return {
      category,
      edge: Number(zScore.toFixed(2)),
      myValue,
      leagueAverage: formatCategoryValue(category, baseline),
    };
  });

  const strengths = edges
    .filter((edge) => edge.edge >= 0)
    .sort((a, b) => b.edge - a.edge)
    .slice(0, 3);
  const weaknesses = edges
    .filter((edge) => edge.edge < 0)
    .sort((a, b) => a.edge - b.edge)
    .slice(0, 3);

  const strengthText = strengths.length
    ? `Top strengths: ${strengths.map((item) => item.category).join(', ')}.`
    : 'No category stands out as a clear strength yet.';
  const weaknessText = weaknesses.length
    ? `Main weaknesses: ${weaknesses.map((item) => item.category).join(', ')}.`
    : 'No clear weaknesses detected from available projections.';

  return {
    strengths,
    weaknesses,
    summaryText: `${strengthText} ${weaknessText}`,
  };
}

function buildDraftLogRows(draftHistory) {
  return (Array.isArray(draftHistory) ? draftHistory : []).map((entry, index) => {
    const player = entry?.playerId && typeof entry.playerId === 'object'
      ? entry.playerId
      : null;
    const team = entry?.teamId && typeof entry.teamId === 'object'
      ? entry.teamId
      : null;
    return {
      pickNumber: index + 1,
      timestamp: entry?.createdAt ? new Date(entry.createdAt).toISOString() : '',
      phase: String(entry?.phase || '').toUpperCase(),
      playerName: player?.name || '',
      teamOwner: team?.ownerName || '',
      teamName: team?.teamName || '',
      amount: Number(entry?.amount || 0),
    };
  });
}

function buildPostDraftAnalysis({
  league,
  teams,
  players,
  draftHistory,
}) {
  const categories = normalizeCategories(league?.scoringCategories);
  const playersById = new Map(
    (Array.isArray(players) ? players : []).map((player) => [String(player._id), player])
  );
  const teamSummaries = buildTeamSummaries(teams || [], playersById, categories);
  const mySummary = teamSummaries.find((summary) => summary.isMyTeam) || teamSummaries[0] || null;
  const matchupOutlook = buildMatchupOutlook(mySummary, teamSummaries, categories);
  const strengthSummary = buildStrengthWeaknessSummary(mySummary, teamSummaries, categories);
  const allRosterRows = teamSummaries.flatMap((teamSummary) => teamSummary.rosterRows);
  const draftLogRows = buildDraftLogRows(draftHistory);

  return {
    generatedAt: new Date().toISOString(),
    league: {
      leagueId: String(league?._id || ''),
      name: league?.name || '',
      scoringCategories: categories,
    },
    myTeamId: mySummary?.teamId || null,
    myTeamSummary: mySummary,
    teamSummaries: teamSummaries.map((summary) => ({
      teamId: summary.teamId,
      ownerName: summary.ownerName,
      teamName: summary.teamName,
      isMyTeam: summary.isMyTeam,
      budgetRemaining: summary.budgetRemaining,
      rosterSize: summary.rosterSize,
      categoryTotals: summary.categoryTotals,
    })),
    matchupOutlook,
    strengths: strengthSummary.strengths,
    weaknesses: strengthSummary.weaknesses,
    summaryText: strengthSummary.summaryText,
    exports: {
      myRosterRows: mySummary ? mySummary.rosterRows : [],
      allRosterRows,
      draftLogRows,
    },
  };
}

module.exports = {
  buildPostDraftAnalysis,
};
