const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPostDraftAnalysis } = require('../utils/postDraftAnalysis');

function makePlayer(id, name, positions, projectedValue, projections) {
  return {
    _id: id,
    name,
    mlbTeam: 'TST',
    eligiblePositions: positions,
    projectedValue,
    projections,
  };
}

test('buildPostDraftAnalysis returns normalized category summaries, matchups, and exports', () => {
  const league = {
    _id: 'league-1',
    name: 'Analysis League',
    scoringCategories: ['RUNS', 'HR', 'RBI', 'SB', 'AVG', 'WINS', 'SAVES', 'STRIKEOUTS', 'ERA', 'WHIP'],
  };

  const players = [
    makePlayer('p1', 'My Hitter', ['OF'], 30, { R: 100, HR: 30, RBI: 95, SB: 18, AVG: 0.298 }),
    makePlayer('p2', 'My Pitcher', ['P'], 26, { W: 14, SV: 8, K: 200, ERA: 3.1, WHIP: 1.05 }),
    makePlayer('p3', 'Opp Hitter', ['OF'], 24, { R: 75, HR: 18, RBI: 72, SB: 9, AVG: 0.262 }),
    makePlayer('p4', 'Opp Pitcher', ['P'], 20, { WINS: 10, SAVES: 2, STRIKEOUTS: 155, ERA: 3.95, WHIP: 1.26 }),
  ];

  const teams = [
    {
      _id: 'team-1',
      ownerName: 'Owner One',
      teamName: 'My Team',
      isMyTeam: true,
      budget: { remaining: 0 },
      roster: [
        { playerId: 'p1', position: 'OF', cost: 32, draftPhase: 'MAIN' },
        { playerId: 'p2', position: 'P', cost: 25, draftPhase: 'MAIN' },
      ],
    },
    {
      _id: 'team-2',
      ownerName: 'Owner Two',
      teamName: 'Opponent',
      isMyTeam: false,
      budget: { remaining: 0 },
      roster: [
        { playerId: 'p3', position: 'OF', cost: 20, draftPhase: 'MAIN' },
        { playerId: 'p4', position: 'P', cost: 14, draftPhase: 'TAXI' },
      ],
    },
  ];

  const draftHistory = [
    {
      createdAt: new Date('2026-02-21T10:00:00.000Z'),
      phase: 'MAIN',
      amount: 32,
      playerId: { name: 'My Hitter' },
      teamId: { ownerName: 'Owner One', teamName: 'My Team' },
    },
    {
      createdAt: new Date('2026-02-21T10:15:00.000Z'),
      phase: 'TAXI',
      amount: 0,
      playerId: { name: 'Opp Pitcher' },
      teamId: { ownerName: 'Owner Two', teamName: 'Opponent' },
    },
  ];

  const analysis = buildPostDraftAnalysis({ league, teams, players, draftHistory });

  assert.equal(analysis.league.name, 'Analysis League');
  assert.deepEqual(
    analysis.league.scoringCategories,
    ['R', 'HR', 'RBI', 'SB', 'AVG', 'W', 'SV', 'K', 'ERA', 'WHIP']
  );
  assert.equal(analysis.myTeamSummary.ownerName, 'Owner One');
  assert.ok(analysis.summaryText.length > 0);
  assert.equal(analysis.matchupOutlook.length, 1);
  assert.equal(analysis.matchupOutlook[0].opponentOwnerName, 'Owner Two');
  assert.ok(['Likely win', 'Likely loss', 'Toss-up'].includes(analysis.matchupOutlook[0].projectedResult));
  assert.equal(analysis.exports.myRosterRows.length, 2);
  assert.equal(analysis.exports.allRosterRows.length, 4);
  assert.equal(analysis.exports.draftLogRows.length, 2);
  assert.equal(analysis.exports.draftLogRows[1].phase, 'TAXI');
});

test('buildPostDraftAnalysis handles empty team context and returns safe defaults', () => {
  const analysis = buildPostDraftAnalysis({
    league: { _id: 'league-empty', name: 'Empty League', scoringCategories: [] },
    teams: [],
    players: [],
    draftHistory: [],
  });

  assert.equal(analysis.myTeamId, null);
  assert.equal(analysis.teamSummaries.length, 0);
  assert.equal(analysis.matchupOutlook.length, 0);
  assert.equal(analysis.strengths.length, 0);
  assert.equal(analysis.weaknesses.length, 0);
  assert.ok(analysis.summaryText.includes('Set one team as "My Team"'));
});

test('buildPostDraftAnalysis can produce toss-up and likely-loss matchup labels', () => {
  const baseLeague = {
    _id: 'league-2',
    name: 'Parity League',
    scoringCategories: ['HR', 'AVG'],
  };

  const players = [
    makePlayer('a', 'A', ['OF'], 10, { HR: '20', AVG: '0.270' }),
    makePlayer('b', 'B', ['OF'], 10, { HR: 20, AVG: 0.270 }),
    makePlayer('c', 'C', ['OF'], 10, { HR: 30, AVG: 0.290 }),
  ];

  const teams = [
    {
      _id: 'mine',
      ownerName: 'Mine',
      teamName: 'Mine',
      isMyTeam: true,
      budget: { remaining: 0 },
      roster: [{ playerId: 'a', position: 'OF', cost: 1, draftPhase: 'MAIN' }],
    },
    {
      _id: 'tie',
      ownerName: 'Tie',
      teamName: 'Tie',
      isMyTeam: false,
      budget: { remaining: 0 },
      roster: [{ playerId: 'b', position: 'OF', cost: 1, draftPhase: 'MAIN' }],
    },
    {
      _id: 'strong',
      ownerName: 'Strong',
      teamName: 'Strong',
      isMyTeam: false,
      budget: { remaining: 0 },
      roster: [{ playerId: 'c', position: 'OF', cost: 1, draftPhase: 'MAIN' }],
    },
  ];

  const analysis = buildPostDraftAnalysis({
    league: baseLeague,
    teams,
    players,
    draftHistory: [],
  });

  const tossUp = analysis.matchupOutlook.find((item) => item.opponentTeamId === 'tie');
  const likelyLoss = analysis.matchupOutlook.find((item) => item.opponentTeamId === 'strong');
  assert.equal(tossUp?.projectedResult, 'Toss-up');
  assert.equal(likelyLoss?.projectedResult, 'Likely loss');
});
