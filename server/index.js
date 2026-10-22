require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/tracker', require('./routes/tracker'));
app.use('/api/opportunities', require('./routes/opportunities'));

app.use('/api/match', require('./routes/match'));

app.use('/api/discover', require('./routes/discover')); // Member 2

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
