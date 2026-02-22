import type { Team } from '@/api/teams';

export const MAIN_ROSTER_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL', 'P'] as const;
export const DEFAULT_MAIN_SLOT_COUNTS: Record<(typeof MAIN_ROSTER_POSITIONS)[number], number> = {
  C: 2,
  '1B': 1,
  '2B': 1,
  '3B': 1,
  SS: 1,
  OF: 5,
  UTIL: 1,
  P: 9,
};
export const DEFAULT_BENCH_SLOTS = 6;
const MAIN_POSITION_SET = new Set<string>(MAIN_ROSTER_POSITIONS);

export function normalizeMainSlotConfig(
  rosterSlots: Record<string, unknown> | undefined | null
): Record<string, number> {
  const source = rosterSlots ?? {};
  const normalized: Record<string, number> = { ...DEFAULT_MAIN_SLOT_COUNTS };
  for (const position of MAIN_ROSTER_POSITIONS) {
    const parsed = Number(source[position]);
    if (Number.isFinite(parsed) && parsed >= 0) {
      normalized[position] = parsed;
    }
  }
  return normalized;
}

export function getTotalMainSlots(slotConfig: Record<string, number>): number {
  return Object.values(slotConfig).reduce((sum, rawCount) => {
    const count = Number(rawCount);
    return sum + (Number.isFinite(count) && count > 0 ? count : 0);
  }, 0);
}

export function getMainFilledCount(team: Team | null | undefined): number {
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  return roster.reduce((sum, slot) => {
    if (!slot || slot.draftPhase === 'TAXI') return sum;
    const position = String(slot.position || '').toUpperCase();
    return MAIN_POSITION_SET.has(position) ? sum + 1 : sum;
  }, 0);
}

export function getFilledCountForPosition(team: Team | null | undefined, position: string): number {
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const normalizedPosition = String(position || '').toUpperCase();
  return roster.reduce((sum, slot) => {
    if (!slot || slot.draftPhase === 'TAXI') return sum;
    return String(slot.position || '').toUpperCase() === normalizedPosition ? sum + 1 : sum;
  }, 0);
}

export function getMainSlotsLeft(team: Team | null | undefined, slotConfig: Record<string, number>): number {
  const totalMainSlots = getTotalMainSlots(slotConfig);
  return Math.max(0, totalMainSlots - getMainFilledCount(team));
}

export function getEligibleOpenPositions(
  team: Team | null | undefined,
  slotConfig: Record<string, number>,
  eligiblePositions: string[] | undefined | null
): string[] {
  if (!Array.isArray(eligiblePositions)) return [];
  const seen = new Set<string>();
  const openPositions: string[] = [];
  for (const rawPosition of eligiblePositions) {
    const position = String(rawPosition || '').trim().toUpperCase();
    if (!position || seen.has(position)) continue;
    seen.add(position);
    if (!MAIN_POSITION_SET.has(position)) continue;
    const maxSlots = Number(slotConfig[position] ?? 0);
    if (!Number.isFinite(maxSlots) || maxSlots <= 0) continue;
    const filled = getFilledCountForPosition(team, position);
    if (filled < maxSlots) {
      openPositions.push(position);
    }
  }
  return openPositions;
}

export function getBenchSlots(rawBenchSlots: unknown): number {
  const parsed = Number(rawBenchSlots);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_BENCH_SLOTS;
  return Math.floor(parsed);
}

export function getTaxiFilledCount(team: Team | null | undefined): number {
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  return roster.reduce((sum, slot) => {
    if (!slot) return sum;
    if (slot.draftPhase === 'TAXI') return sum + 1;
    return String(slot.position || '').toUpperCase() === 'BENCH' ? sum + 1 : sum;
  }, 0);
}

export function getTaxiSlotsLeft(team: Team | null | undefined, benchSlots: number): number {
  return Math.max(0, benchSlots - getTaxiFilledCount(team));
}
