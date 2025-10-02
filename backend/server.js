require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json()); // parse JSON requests
app.use(express.static(path.join(__dirname))); // Serve static files from the backend directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve uploads directory

// Serve index HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'meeting-assistant.html'));
});

// Import routes
const meetingRoutes = require('./routes/meetingRoutes');

// Register routes
app.use('/api/meetings', meetingRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
