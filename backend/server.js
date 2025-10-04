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
app.use(express.static(path.join(__dirname, '..'))); // Serve static files from project root
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve uploads directory

// Serve index HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'meeting-assistant.html'));
});

// Import routes
const meetingRoutes = require('./routes/meetingRoutes');

// --- Utility: Transcribe and Save to Supabase ---
const { exec } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function transcribeAndSave(audioFilePath) {
  exec(`python controllers/transcribe.py "${audioFilePath}"`, (err, stdout, stderr) => {
    if (err) return console.error(err);

    let result;
    try {
      result = JSON.parse(stdout);
    } catch (e) {
      console.error("Failed to parse transcription output:", stdout);
      return;
    }

    if (result.error) {
      console.error("Transcription failed:", result.error);
      return;
    }

    const { transcript, filename } = result;

    // Save in Supabase
    supabase
      .from('meetings')
      .insert({ filename, transcript })
      .then(console.log)
      .catch(console.error);
  });
}

// Example usage:
// transcribeAndSave('uploads/your-audio-file.mp3');

// Register routes
app.use('/api/meetings', meetingRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
