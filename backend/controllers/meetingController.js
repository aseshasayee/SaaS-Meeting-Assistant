
const path = require('path');
const { exec } = require('child_process');
const Fuse = require('fuse.js');
const fs = require('fs');
const { spawn } = require('child_process');
const employees = require('../employees.json');
const db = require('../services/databaseService');

const fuse = new Fuse(employees, { keys: ['name'], threshold: 0.3 });

function correctNamesInTranscript(transcript) {
  // Split transcript into words, try to correct each word
  return transcript.split(/\b/).map(word => {
    const result = fuse.search(word);
    if (result.length && result[0].score < 0.3) {
      return result[0].item.name;
    }
    return word;
  }).join('');
}

// Run Python script to extract tasks using Gemini AI
async function extractTasksFromTranscript(transcript) {
  return new Promise((resolve, reject) => {
    // Run the Python task extraction script
    const pythonProcess = spawn('python', [
      path.join(__dirname, '..', 'agents', 'task_allot.py')
    ]);
    
    let outputData = '';
    let errorData = '';

    // Pass transcript and employees as JSON to stdin
    pythonProcess.stdin.write(JSON.stringify({
      transcript: transcript,
      employees: employees
    }));
    pythonProcess.stdin.end();

    // Collect data from script
    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    // Handle process completion
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Task extraction failed: ${errorData}`));
      }
      
      try {
        const tasks = JSON.parse(outputData);
        resolve(tasks);
      } catch (error) {
        reject(new Error(`Failed to parse tasks: ${error.message}`));
      }
    });
  });
}

const uploadMeeting = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const filePath = path.join(__dirname, '..', req.file.path);

  // Call the local Whisper transcription script
  exec(`python controllers/transcribe.py "${filePath}"`, { cwd: path.join(__dirname, '..') }, async (error, stdout, stderr) => {
    console.log("Transcription output:", stdout);
    
    if (stderr) {
      console.log("Transcription error:", stderr);
    }
    
    if (error && !stdout) {
      // Complete failure with no output
      return res.status(500).json({ 
        message: 'Transcription failed', 
        error: stderr || error.message,
        command: `python controllers/transcribe.py "${filePath}"`
      });
    }
    
    // Use only the actual transcript text, not debug info
    const rawTranscript = stdout.trim();
    const correctedTranscript = correctNamesInTranscript(rawTranscript);
    
    // The transcript file path - this should already exist from transcribe.py
    const transcriptFile = `${filePath}.txt`;
    
    // Store the corrected transcript in the file (overwrite with corrections)
    fs.writeFileSync(transcriptFile, correctedTranscript);
    
    try {
      // Extract tasks from the transcript
      let tasks = [];
      try {
        tasks = await extractTasksFromTranscript(correctedTranscript);
        if (!tasks || tasks.length === 0) {
          console.log("Warning: No tasks were extracted from the transcript");
        }
      } catch (taskError) {
        console.log("Task extraction error:", taskError);
        return res.status(500).json({
          message: 'Task extraction failed',
          error: taskError.message,
          file: req.file.filename,
          path: filePath,
          transcript: correctedTranscript
        });
      }
      
      // Save meeting data to Supabase
      try {
        // Process and save meeting data
        const dbResult = await db.processMeeting(
          req.file.filename,
          correctedTranscript,
          tasks
        );

        res.status(200).json({
          message: 'File uploaded, transcribed, tasks extracted, and saved to database successfully',
          file: req.file.filename,
          path: filePath,
          transcript: correctedTranscript,
          rawTranscript: rawTranscript,
          tasks: tasks,
          transcriptFile: transcriptFile,
          dbResult: dbResult
        });
      } catch (dbError) {
        console.error("Database error:", dbError);
        
        // If database save fails, still return the processed data
        res.status(200).json({
          message: 'File processed successfully, but database save failed',
          file: req.file.filename,
          path: filePath,
          transcript: correctedTranscript,
          rawTranscript: rawTranscript,
          tasks: tasks,
          transcriptFile: transcriptFile,
          dbError: dbError.message
        });
      }
    } catch (error) {
      res.status(200).json({
        message: 'File uploaded and transcribed successfully, but task extraction failed',
        file: req.file.filename,
        path: filePath,
        transcript: correctedTranscript,
        rawTranscript: rawTranscript,
        error: error.message
      });
    }
  });
};

module.exports = { 
  uploadMeeting 
};
