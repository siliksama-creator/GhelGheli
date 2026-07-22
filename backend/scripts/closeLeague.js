require('dotenv').config();
const { closeActiveSeason } = require('../src/services/leagueService');
closeActiveSeason().then(r => { console.log(r); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
