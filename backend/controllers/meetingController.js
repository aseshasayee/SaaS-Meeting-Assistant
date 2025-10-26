
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Basic uploadMeeting controller: transcribes audio and saves transcript in backend/transcripts
const uploadMeeting = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const filePath = path.join(__dirname, '..', req.file.path);
  const transcriptsDir = path.join(__dirname, '..', 'transcripts');
  if (!fs.existsSync(transcriptsDir)) {
    fs.mkdirSync(transcriptsDir);
  }
  const transcriptFile = path.join(transcriptsDir, req.file.filename + '.txt');

  exec(`python controllers/transcribe.py "${filePath}"`, { cwd: path.join(__dirname, '..') }, async (error, stdout, stderr) => {
    if (stderr) {
      console.log("Transcription error:", stderr);
    }
    if (error && !stdout) {
      return res.status(500).json({ 
        message: 'Transcription failed', 
        error: stderr || error.message,
        command: `python controllers/transcribe.py \"${filePath}\"`
      });
    }
    const transcript = stdout.trim();
    fs.writeFileSync(transcriptFile, transcript);

    // Save transcript to Supabase
    try {
      const { data, error } = await supabase
        .from('meetings')
        .insert({ filename: req.file.filename, transcript })
        .select();
      if (error) {
        console.error('Supabase insert error:', error);
      }
      res.status(200).json({
        message: 'File uploaded and transcribed successfully',
        file: req.file.filename,
        path: filePath,
        transcript: transcript,
        transcriptFile: transcriptFile,
        supabaseResult: data
      });
    } catch (dbError) {
      console.error('Supabase insert exception:', dbError);
      res.status(200).json({
        message: 'File uploaded and transcribed, but failed to save to Supabase',
        file: req.file.filename,
        path: filePath,
        transcript: transcript,
        transcriptFile: transcriptFile,
        dbError: dbError.message
      });
    }
  });
};

module.exports = { uploadMeeting };