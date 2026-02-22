const MAIN_ROSTER_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL', 'P'];
const MAIN_ROSTER_POSITION_SET = new Set(MAIN_ROSTER_POSITIONS);
const DEFAULT_MAIN_ROSTER_SLOTS = {
  C: 2,
  '1B': 1,
  '2B': 1,
  '3B': 1,
  SS: 1,
  OF: 5,
  UTIL: 1,
  P: 9,
};
const DEFAULT_BENCH_SLOTS = 6;

function normalizeMainRosterSlots(rosterSlots) {
  const source = rosterSlots && typeof rosterSlots === 'object' ? rosterSlots : {};
  const normalized = {};
  let hasConfiguredMainSlots = false;

  for (const [position, fallback] of Object.entries(DEFAULT_MAIN_ROSTER_SLOTS)) {
    const parsed = Number(source[position]);
    const count = Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    normalized[position] = count;
    if (count > 0) hasConfiguredMainSlots = true;
  }

  return hasConfiguredMainSlots ? normalized : { ...DEFAULT_MAIN_ROSTER_SLOTS };
}

function getBenchSlots(league) {
  const parsed = Number(league?.benchSlots);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_BENCH_SLOTS;
  return Math.floor(parsed);
}

function getMainRosterCounts(team, slotConfigInput) {
  const slotConfig = slotConfigInput || normalizeMainRosterSlots();
  const counts = Object.fromEntries(
    Object.keys(slotConfig).map((position) => [position, 0])
  );
  const roster = Array.isArray(team?.roster) ? team.roster : [];

  for (const slot of roster) {
    if (!slot || slot.draftPhase === 'TAXI') continue;
    const position = String(slot.position || '').toUpperCase();
    if (!MAIN_ROSTER_POSITION_SET.has(position)) continue;
    counts[position] = Number(counts[position] || 0) + 1;
  }

  return counts;
}

function getMainRosterFilledCount(team, leagueOrSlotConfig) {
  const slotConfig = normalizeMainRosterSlots(
    leagueOrSlotConfig?.rosterSlots || leagueOrSlotConfig
  );
  const counts = getMainRosterCounts(team, slotConfig);
  return Object.entries(slotConfig).reduce((sum, [position, rawMax]) => {
    const maxSlots = Number(rawMax);
    if (!Number.isFinite(maxSlots) || maxSlots <= 0) return sum;
    const filled = Number(counts[position] || 0);
    return sum + Math.min(filled, maxSlots);
  }, 0);
}

function getTotalMainRosterSlots(leagueOrSlotConfig) {
  const slotConfig = normalizeMainRosterSlots(
    leagueOrSlotConfig?.rosterSlots || leagueOrSlotConfig
  );
  return Object.values(slotConfig).reduce((sum, rawCount) => {
    const count = Number(rawCount);
    return sum + (Number.isFinite(count) && count > 0 ? count : 0);
  }, 0);
}

function normalizeEligiblePositions(eligiblePositions) {
  if (!Array.isArray(eligiblePositions)) return [];
  const unique = new Set();
  const normalized = [];
  for (const rawPosition of eligiblePositions) {
    const position = String(rawPosition || '').trim().toUpperCase();
    if (!position || unique.has(position)) continue;
    unique.add(position);
    normalized.push(position);
  }
  return normalized;
}

function getEligibleOpenPositions(team, leagueOrSlotConfig, eligiblePositions) {
  const slotConfig = normalizeMainRosterSlots(
    leagueOrSlotConfig?.rosterSlots || leagueOrSlotConfig
  );
  const counts = getMainRosterCounts(team, slotConfig);
  const normalizedEligible = normalizeEligiblePositions(eligiblePositions);

  return normalizedEligible.filter((position) => {
    if (!MAIN_ROSTER_POSITION_SET.has(position)) return false;
    const maxSlots = Number(slotConfig[position] || 0);
    if (!Number.isFinite(maxSlots) || maxSlots <= 0) return false;
    const filled = Number(counts[position] || 0);
    return filled < maxSlots;
  });
}

function getMainSlotsLeft(team, leagueOrSlotConfig) {
  const totalSlots = getTotalMainRosterSlots(leagueOrSlotConfig);
  const filledSlots = getMainRosterFilledCount(team, leagueOrSlotConfig);
  return Math.max(0, totalSlots - filledSlots);
}

function areAllTeamsMainRostersFull(teams, leagueOrSlotConfig) {
  const teamList = Array.isArray(teams) ? teams : [];
  if (!teamList.length) return false;
  return teamList.every((team) => getMainSlotsLeft(team, leagueOrSlotConfig) === 0);
}

function getTaxiFilledCount(team) {
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  return roster.reduce((sum, slot) => {
    if (!slot) return sum;
    if (slot.draftPhase === 'TAXI') return sum + 1;
    const position = String(slot.position || '').toUpperCase();
    return position === 'BENCH' ? sum + 1 : sum;
  }, 0);
}

function getTaxiSlotsLeft(team, league) {
  const benchSlots = getBenchSlots(league);
  const taxiFilled = getTaxiFilledCount(team);
  return Math.max(0, benchSlots - taxiFilled);
}

module.exports = {
  MAIN_ROSTER_POSITIONS,
  DEFAULT_MAIN_ROSTER_SLOTS,
  DEFAULT_BENCH_SLOTS,
  normalizeMainRosterSlots,
  getBenchSlots,
  getMainRosterCounts,
  getMainRosterFilledCount,
  getTotalMainRosterSlots,
  getEligibleOpenPositions,
  getMainSlotsLeft,
  areAllTeamsMainRostersFull,
  getTaxiFilledCount,
  getTaxiSlotsLeft,
};
