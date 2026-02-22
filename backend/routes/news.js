const express = require('express');

const router = express.Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  const mockNews = [
    { id: '1', playerName: 'Mike Trout', message: 'Expected to return from IL next week.', playerId: null },
    { id: '2', playerName: 'Shohei Ohtani', message: 'Trade rumors: possible move before deadline.', playerId: null },
    { id: '3', playerName: 'Fernando Tatis Jr.', message: 'Day-to-day with shoulder soreness.', playerId: null }
  ];
  return res.json(mockNews);
});

module.exports = router;
