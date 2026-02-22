const test = require('node:test');
const assert = require('node:assert/strict');

const { buildValuationMap } = require('../utils/valuation');

function makePlayer(id, name, eligiblePositions, adp, projections) {
  return {
    _id: id,
    name,
    eligiblePositions,
    isDrafted: false,
    adp,
    projections,
  };
}

test('buildValuationMap supports alias scoring categories and returns valuation payload', () => {
  const league = {
    totalBudget: 260,
    scoringCategories: ['RUNS', 'HOME_RUNS', 'WINS', 'STRIKEOUTS', 'ERA', 'WHIP'],
    rosterSlots: { C: 0, '1B': 0, '2B': 0, '3B': 0, SS: 0, OF: 1, UTIL: 0, P: 1 },
  };

  const players = [
    makePlayer('p1', 'Hitter A', ['OF'], 20, {
      R: 100,
      HOME_RUNS: 35,
      RBI: 95,
      SB: 18,
      AVG: 0.298,
    }),
    makePlayer('p2', 'Pitcher A', ['P'], 22, {
      W: 16,
      STRIKEOUTS: 220,
      ERA: 2.9,
      WHIP: 1.04,
    }),
    makePlayer('p3', 'Pitcher B', ['P'], 140, {
      WINS: 9,
      K: 135,
      ERA: 4.2,
      WHIP: 1.31,
    }),
  ];

  const valuation = buildValuationMap(players, league, 2, []);
  assert.equal(valuation.size, 3);

  const hitter = valuation.get('p1');
  const ace = valuation.get('p2');
  const weakPitcher = valuation.get('p3');

  assert.ok(hitter);
  assert.ok(ace);
  assert.ok(weakPitcher);
  assert.equal(typeof hitter.projectedValue, 'number');
  assert.equal(hitter.valuation.modelVersion, 'stats-v5');
  assert.ok(ace.projectedValue > weakPitcher.projectedValue);
});

test('buildValuationMap gives pitchers higher baseline injury risk than hitters when no injury data exists', () => {
  const league = {
    totalBudget: 260,
    scoringCategories: ['HR', 'RBI', 'SB', 'AVG', 'W', 'SV', 'K', 'ERA', 'WHIP'],
  };
  const players = [
    makePlayer('h1', 'Healthy Hitter', ['OF'], 50, { HR: 20, RBI: 70, SB: 10, AVG: 0.275 }),
    makePlayer('h2', 'Healthy Hitter 2', ['OF'], 60, { HR: 15, RBI: 65, SB: 8, AVG: 0.268 }),
    makePlayer('p1', 'Healthy Pitcher', ['P'], 50, { W: 12, SV: 0, K: 170, ERA: 3.5, WHIP: 1.15 }),
    makePlayer('p2', 'Healthy Pitcher 2', ['P'], 60, { W: 10, SV: 0, K: 150, ERA: 3.8, WHIP: 1.22 }),
  ];

  const valuation = buildValuationMap(players, league, 2, []);
  const hitterRisk = valuation.get('h1').valuation.injuryRiskPct;
  const pitcherRisk = valuation.get('p1').valuation.injuryRiskPct;
  assert.ok(pitcherRisk > hitterRisk);
});

test('buildValuationMap respects team demand path and parses string projection values', () => {
  const league = {
    totalBudget: 260,
    scoringCategories: ['RUNS', 'RBI', 'AVG', 'WINS', 'ERA'],
    rosterSlots: { C: 0, '1B': 1, '2B': 0, '3B': 0, SS: 0, OF: 0, UTIL: 0, P: 1 },
  };
  const teams = [
    {
      roster: [{ position: '1B' }],
    },
    {
      roster: [],
    },
  ];
  const players = [
    makePlayer('h1', '1B Strong', ['1B'], 40, {
      RUNS: '95',
      RBI: '102',
      BATTING_AVG: '0.301',
    }),
    makePlayer('h2', '1B Weak', ['1B'], 170, {
      R: '61',
      RBI: '58',
      AVG: '0.248',
    }),
    makePlayer('p1', 'Pitcher Strong', ['P'], 45, {
      WINS: '15',
      ERA: '3.05',
    }),
    makePlayer('p2', 'Pitcher Weak', ['P'], 185, {
      W: '8',
      ERA: '4.60',
    }),
  ];

  const valuation = buildValuationMap(players, league, 2, teams);
  assert.ok(valuation.get('h1').projectedValue > valuation.get('h2').projectedValue);
  assert.ok(valuation.get('p1').projectedValue > valuation.get('p2').projectedValue);
});
