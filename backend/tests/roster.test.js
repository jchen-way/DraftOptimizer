const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getEligibleOpenPositions,
  getMainSlotsLeft,
  areAllTeamsMainRostersFull,
  getTaxiSlotsLeft,
  normalizeMainRosterSlots,
} = require('../utils/roster');

test('getEligibleOpenPositions only returns open eligible slots', () => {
  const league = { rosterSlots: { C: 0, '1B': 1, OF: 1, UTIL: 0, P: 0, '2B': 0, '3B': 0, SS: 0 } };
  const team = {
    roster: [
      { position: '1B', draftPhase: 'MAIN' },
    ],
  };

  const positions = getEligibleOpenPositions(team, league, ['1B', 'OF']);
  assert.deepEqual(positions, ['OF']);
});

test('getMainSlotsLeft ignores taxi slots for main-round capacity', () => {
  const league = { rosterSlots: { C: 0, '1B': 1, OF: 1, UTIL: 0, P: 0, '2B': 0, '3B': 0, SS: 0 } };
  const team = {
    roster: [
      { position: '1B', draftPhase: 'MAIN' },
      { position: 'BENCH', draftPhase: 'TAXI' },
    ],
  };

  assert.equal(getMainSlotsLeft(team, league), 1);
});

test('areAllTeamsMainRostersFull requires every team to finish main slots', () => {
  const league = { rosterSlots: normalizeMainRosterSlots({ C: 0, '1B': 1, OF: 0, UTIL: 0, P: 0, '2B': 0, '3B': 0, SS: 0 }) };
  const fullTeam = { roster: [{ position: '1B', draftPhase: 'MAIN' }] };
  const openTeam = { roster: [] };

  assert.equal(areAllTeamsMainRostersFull([fullTeam, openTeam], league), false);
  assert.equal(areAllTeamsMainRostersFull([fullTeam], league), true);
});

test('getTaxiSlotsLeft counts both TAXI phase and BENCH position occupancy', () => {
  const league = { benchSlots: 3 };
  const team = {
    roster: [
      { position: 'BENCH', draftPhase: 'TAXI' },
      { position: 'BENCH', draftPhase: 'MAIN' },
    ],
  };

  assert.equal(getTaxiSlotsLeft(team, league), 1);
});
