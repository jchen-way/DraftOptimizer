const CORE_SAMPLE_PLAYERS = [
  { name: 'Shohei Ohtani', mlbTeam: 'LAD', eligiblePositions: ['P', 'UTIL'], projectedValue: 52, adp: 1 },
  { name: 'Juan Soto', mlbTeam: 'NYY', eligiblePositions: ['OF'], projectedValue: 45, adp: 2 },
  { name: 'Ronald Acuna Jr.', mlbTeam: 'ATL', eligiblePositions: ['OF'], projectedValue: 42, adp: 3 },
  { name: 'Fernando Tatis Jr.', mlbTeam: 'SD', eligiblePositions: ['OF', 'SS'], projectedValue: 40, adp: 4 },
  { name: 'Mookie Betts', mlbTeam: 'LAD', eligiblePositions: ['OF'], projectedValue: 38, adp: 5 },
  { name: 'Bryce Harper', mlbTeam: 'PHI', eligiblePositions: ['1B', 'OF'], projectedValue: 36, adp: 6 },
  { name: 'Freddie Freeman', mlbTeam: 'LAD', eligiblePositions: ['1B'], projectedValue: 38, adp: 7 },
  { name: 'Mike Trout', mlbTeam: 'LAA', eligiblePositions: ['OF'], projectedValue: 35, adp: 8 },
  { name: 'Jose Ramirez', mlbTeam: 'CLE', eligiblePositions: ['3B'], projectedValue: 39, adp: 9 },
  { name: 'Gerrit Cole', mlbTeam: 'NYY', eligiblePositions: ['P'], projectedValue: 30, adp: 10 },
  { name: 'Trea Turner', mlbTeam: 'PHI', eligiblePositions: ['SS'], projectedValue: 35, adp: 11 },
  { name: 'Corbin Burnes', mlbTeam: 'BAL', eligiblePositions: ['P'], projectedValue: 28, adp: 12 },
  { name: 'Kyle Tucker', mlbTeam: 'HOU', eligiblePositions: ['OF'], projectedValue: 34, adp: 13 },
  { name: 'Aaron Judge', mlbTeam: 'NYY', eligiblePositions: ['OF'], projectedValue: 42, adp: 14 },
  { name: 'Yordan Alvarez', mlbTeam: 'HOU', eligiblePositions: ['OF'], projectedValue: 36, adp: 15 },
  { name: 'Jose Altuve', mlbTeam: 'HOU', eligiblePositions: ['2B'], projectedValue: 22, adp: 18 },
  { name: 'Will Smith', mlbTeam: 'LAD', eligiblePositions: ['C'], projectedValue: 20, adp: 45 },
  { name: 'J.T. Realmuto', mlbTeam: 'PHI', eligiblePositions: ['C'], projectedValue: 14, adp: 55 },
  { name: 'Edwin Diaz', mlbTeam: 'NYM', eligiblePositions: ['P'], projectedValue: 18, adp: 25 },
  { name: 'Jackson Merrill', mlbTeam: 'SD', eligiblePositions: ['SS', 'OF'], projectedValue: 12, adp: 80 },
];

const EXTRA_SAMPLE_NAMES = [
  'Bobby Witt Jr.',
  'Julio Rodriguez',
  'Gunnar Henderson',
  'Corey Seager',
  'Matt Olson',
  'Francisco Lindor',
  'Ozzie Albies',
  'Marcus Semien',
  'Pete Alonso',
  'Rafael Devers',
  'Manny Machado',
  'Vladimir Guerrero Jr.',
  'Austin Riley',
  'Adley Rutschman',
  'William Contreras',
  'Bo Bichette',
  'CJ Abrams',
  'Oneil Cruz',
  'Jazz Chisholm Jr.',
  'Christian Yelich',
  'Seiya Suzuki',
  'George Springer',
  'Randy Arozarena',
  'Anthony Santander',
  'Teoscar Hernandez',
  'Luis Robert Jr.',
  'Steven Kwan',
  'Corbin Carroll',
  'Ketel Marte',
  'Christian Walker',
  'Elly De La Cruz',
  'Matt McLain',
  'Royce Lewis',
  'Spencer Steer',
  'Triston Casas',
  'Josh Naylor',
  'Vinnie Pasquantino',
  'Paul Goldschmidt',
  'Cody Bellinger',
  'Xander Bogaerts',
  'Dansby Swanson',
  'Nico Hoerner',
  'Bryson Stott',
  'Andres Gimenez',
  'Gleyber Torres',
  'Alex Bregman',
  'Nolan Arenado',
  'Ha-Seong Kim',
  'Ezequiel Tovar',
  'Anthony Volpe',
  'Masyn Winn',
  'Cal Raleigh',
  'Salvador Perez',
  'Sean Murphy',
  'Gabriel Moreno',
  'Francisco Alvarez',
  'Willson Contreras',
  'Logan O\'Hoppe',
  'Keibert Ruiz',
  'Spencer Strider',
  'Zac Gallen',
  'Logan Webb',
  'Pablo Lopez',
  'George Kirby',
  'Framber Valdez',
  'Max Fried',
  'Blake Snell',
  'Kevin Gausman',
  'Dylan Cease',
  'Luis Castillo',
  'Yoshinobu Yamamoto',
  'Tarik Skubal',
  'Logan Gilbert',
  'Joe Ryan',
  'Grayson Rodriguez',
  'Hunter Greene',
  'Eury Perez',
  'Emmanuel Clase',
  'Josh Hader',
  'Devin Williams',
  'Ryan Helsley',
  'Camilo Doval',
  'Jhoan Duran',
  'Raisel Iglesias',
  'Robert Suarez',
  'Michael Harris II',
  'Bryan Reynolds',
  'Cedric Mullins',
  'Brenton Doyle',
  'Nolan Jones',
  'Lane Thomas',
  'Wyatt Langford',
  'Evan Carter',
  'Jackson Chourio',
  'Colton Cowser',
  'James Wood',
  'Jordan Walker',
  'Alec Bohm',
  'Isaac Paredes',
  'Jake Burger',
  'Ryan Mountcastle',
  'Yandy Diaz',
  'Eloy Jimenez',
  'Byron Buxton',
  'Adolis Garcia',
  'Jorge Soler',
  'Cody Bradford',
  'Seth Lugo',
  'Cristopher Sanchez',
  'Reid Detmers',
  'Shane Baz',
  'Bailey Ober',
  'Tanner Bibee',
  'Bryce Miller',
  'Clay Holmes',
  'Alexis Diaz',
  'Pete Fairbanks',
];

const SYNTHETIC_PLAYER_COUNT = 28;

const TEAM_CODES = [
  'ATL', 'BAL', 'BOS', 'CHC', 'CIN', 'CLE', 'COL', 'DET', 'HOU', 'KC',
  'LAA', 'LAD', 'MIA', 'MIL', 'MIN', 'NYM', 'NYY', 'OAK', 'PHI', 'PIT',
  'SD', 'SEA', 'SF', 'STL', 'TB', 'TEX', 'TOR', 'WSH', 'ARI', 'CHW',
];

const HITTER_POSITION_ROTATION = [
  ['OF'],
  ['SS'],
  ['2B'],
  ['3B'],
  ['1B'],
  ['C'],
  ['OF', 'UTIL'],
  ['1B', 'OF'],
  ['2B', 'SS'],
  ['3B', '1B'],
];

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function buildHitterProjections(projectedValue, seed) {
  const normalized = Math.max(5, projectedValue);
  return {
    R: Math.round(normalized * 2.35 + (seed % 12)),
    HR: Math.round(normalized * 1.12 + (seed % 8)),
    RBI: Math.round(normalized * 2.05 + (seed % 10)),
    SB: Math.max(1, Math.round(normalized * 0.45 + (seed % 7))),
    AVG: round(0.235 + normalized * 0.0014 + (seed % 5) * 0.001),
  };
}

function buildPitcherProjections(projectedValue, seed) {
  const normalized = Math.max(4, projectedValue);
  return {
    W: Math.max(2, Math.round(normalized * 0.48 + (seed % 6))),
    SV: Math.max(0, Math.round((normalized - 5) * 0.5 - 4 + (seed % 4))),
    K: Math.round(normalized * 6.3 + (seed % 25)),
    ERA: round(Math.max(2.2, 4.6 - normalized * 0.055 - (seed % 4) * 0.04)),
    WHIP: round(Math.max(0.95, 1.38 - normalized * 0.01 - (seed % 3) * 0.01)),
  };
}

function withDerivedProjections(player, seed) {
  const positions = Array.isArray(player.eligiblePositions) ? player.eligiblePositions : [];
  const isPurePitcher = positions.length === 1 && positions[0] === 'P';
  return {
    ...player,
    projections: isPurePitcher
      ? buildPitcherProjections(Number(player.projectedValue ?? 0), seed)
      : buildHitterProjections(Number(player.projectedValue ?? 0), seed),
  };
}

function buildExtraSamplePlayers() {
  const fromKnownNames = EXTRA_SAMPLE_NAMES.map((name, index) => {
    const isPitcher = index % 4 === 0;
    const projectedValue = isPitcher
      ? Math.max(4, 28 - Math.floor(index / 6))
      : Math.max(3, 34 - Math.floor(index / 5));
    const adp = 16 + index;
    const eligiblePositions = isPitcher
      ? ['P']
      : HITTER_POSITION_ROTATION[index % HITTER_POSITION_ROTATION.length];
    return withDerivedProjections({
      name,
      mlbTeam: TEAM_CODES[index % TEAM_CODES.length],
      eligiblePositions,
      projectedValue,
      adp,
    }, index + 20);
  });

  const fromSyntheticNames = Array.from({ length: SYNTHETIC_PLAYER_COUNT }, (_, index) => {
    const absoluteIndex = fromKnownNames.length + index;
    const isPitcher = index % 3 === 0;
    const projectedValue = isPitcher
      ? Math.max(2, 13 - Math.floor(index / 5))
      : Math.max(1, 11 - Math.floor(index / 6));
    return withDerivedProjections({
      name: `Sample Prospect ${index + 1}`,
      mlbTeam: TEAM_CODES[absoluteIndex % TEAM_CODES.length],
      eligiblePositions: isPitcher
        ? ['P']
        : HITTER_POSITION_ROTATION[absoluteIndex % HITTER_POSITION_ROTATION.length],
      projectedValue,
      adp: 200 + index,
    }, absoluteIndex + 20);
  });

  return [...fromKnownNames, ...fromSyntheticNames];
}

const MOCK_PLAYERS = [
  ...CORE_SAMPLE_PLAYERS.map((player, index) => withDerivedProjections(player, index)),
  ...buildExtraSamplePlayers(),
];

module.exports = { MOCK_PLAYERS };
