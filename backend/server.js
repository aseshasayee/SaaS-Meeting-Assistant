require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { exec } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Gmail SMTP transporter (use App Password for production)
const mailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER, // your gmail address
    pass: process.env.GMAIL_PASS  // app password
  }
});

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json()); // parse JSON requests
app.use(express.static(path.join(__dirname))); // Serve static files from the backend directory
app.use(express.static(path.join(__dirname, '..'))); // Serve static files from project root
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve uploads directory

// API Routes
const apiRoutes = require('./routes/apiRoutes');
app.use('/api', apiRoutes);

// Serve index HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'meeting-assistant.html'));
});

// Configure multer to store files in uploads folder
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// Helper to call crew agent
const { spawn } = require('child_process');

function runCrewAgent(transcript, callback) {
  // Use Flask API instead of child process
  axios.post('http://localhost:5001/process-transcript', { transcript })
    .then(response => {
      callback(null, JSON.stringify(response.data));
    })
    .catch(error => {
      callback(error);
    });
}

// Helper to send batch emails using Gmail SMTP
async function sendBatchEmails(emailArray) {
  if (!Array.isArray(emailArray) || emailArray.length === 0) return;
  for (const email of emailArray) {
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email.employee_email,
      subject: email.subject,
      html: `<pre>${email.body}</pre>`
    };
    try {
      await mailTransporter.sendMail(mailOptions);
      console.log('Email sent to', email.employee_email);
    } catch (err) {
      console.error('Error sending email to', email.employee_email, err);
    }
  }
}

// POST /api/meetings/upload - Company-based upload with authentication
app.post('/api/meetings/upload', upload.single('meeting'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    // Get user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user profile with company info
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select(`
        *,
        companies (
          id,
          name
        )
      `)
      .eq('id', user.id)
      .single();

    if (profileError) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const companyId = profile.company_id;
    const companyName = profile.companies.name;

    const filePath = path.join(__dirname, 'uploads', req.file.filename);
    const transcriptsDir = path.join(__dirname, 'transcripts');
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir);
    }
    const transcriptFile = path.join(transcriptsDir, req.file.filename + '.txt');

    // Transcribe the file
    exec(`python controllers/transcribe.py "${filePath}"`, { cwd: __dirname }, async (error, stdout, stderr) => {
      if (stderr) console.log("Transcription error:", stderr);
      
      if (error && !stdout) {
        return res.status(500).json({ 
          message: 'Transcription failed', 
          error: stderr || error.message
        });
      }

      const transcript = stdout.trim();
      fs.writeFileSync(transcriptFile, transcript);

      // Save meeting to database with company info
      const { data: meetingData, error: dbError } = await supabase
        .from('meetings')
        .insert({ 
          filename: req.file.filename, 
          transcript,
          user_id: user.id,
          company_id: companyId
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database save error:', dbError);
        return res.status(500).json({ error: 'Failed to save meeting' });
      }

      // Get company employees for the agent
      const { data: employees, error: empError } = await supabase
        .from('employees')
        .select('name, email, department')
        .eq('company_id', companyId);

      // Prepare data for CrewAI agent including company context
      const agentData = {
        transcript,
        company_name: companyName,
        employees: employees || [],
        meeting_id: meetingData.id
      };

      // Call CrewAI agent with company context
      try {
        const response = await axios.post('http://localhost:5001/process-transcript', agentData);
        const crewResult = response.data;

        // Update meeting with summary
        if (crewResult.summary) {
          await supabase
            .from('meetings')
            .update({ summary: crewResult.summary })
            .eq('id', meetingData.id);
        }

        // Insert tasks with company reference
        let insertedTasks = [];
        if (crewResult.action_items && crewResult.action_items.length > 0) {
          const tasksToInsert = crewResult.action_items.map(item => ({
            meeting_id: meetingData.id,
            company_id: companyId,
            task_description: item.task,
            due_date: item.deadline || null,
            status: 'pending'
          }));

          const { data: tasksData, error: tasksError } = await supabase
            .from('tasks')
            .insert(tasksToInsert)
            .select();

          if (!tasksError) {
            insertedTasks = tasksData;
          }
        }

        // Send emails if available
        if (crewResult.emails && crewResult.emails.length > 0) {
          await sendBatchEmails(crewResult.emails);
        }

        res.json({
          message: 'Meeting processed successfully',
          meeting: meetingData,
          summary: crewResult.summary,
          tasks: insertedTasks,
          emailsSent: crewResult.emails ? crewResult.emails.length : 0
        });

      } catch (crewError) {
        console.error('Crew agent error:', crewError);
        res.json({
          message: 'Meeting saved but AI processing failed',
          meeting: meetingData,
          tasks: [],
          error: 'AI processing unavailable'
        });
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});
      // Support both crewResult.action_items and crewResult.meeting_summary.action_items
      let actionItems = [];
      if (crewResult) {
        if (crewResult.action_items) {
          actionItems = crewResult.action_items;
        } else if (crewResult.meeting_summary && crewResult.meeting_summary.action_items) {
          actionItems = crewResult.meeting_summary.action_items;
        }
      }
      if (actionItems.length > 0 && supabaseResult && supabaseResult.length > 0) {
        const meetingId = supabaseResult[0].id;
        // Look up employee_id by email for each action item
        const tasksToInsert = [];
        for (const item of actionItems) {
          let employeeId = null;
          if (item.employee_email) {
            try {
              const { data: empData, error: empError } = await supabase
                .from('employees')
                .select('id')
                .eq('email', item.employee_email)
                .single();
              if (empData && empData.id) {
                employeeId = empData.id;
              }
            } catch (e) {
              // Ignore lookup error, leave employeeId null
            }
          }
          tasksToInsert.push({
            meeting_id: meetingId,
            employee_id: employeeId,
            task_description: item.task,
            due_date: item.deadline || null,
            status: 'pending'
          });
        }
        try {
          const { data: tasksData, error: tasksError } = await supabase
            .from('tasks')
            .insert(tasksToInsert)
            .select();
          if (tasksError) {
            dbError = tasksError;
          } else {
            insertedTasks = tasksData;
          }
        } catch (err) {
          dbError = err;
        }
      }

      // Send batch emails if present
      if (crewResult && crewResult.emails && crewResult.emails.length > 0) {
        try {
          await sendBatchEmails(crewResult.emails);
        } catch (emailErr) {
          console.error('Error sending batch emails:', emailErr);
        }
      }
      // Format response for frontend
      const responseData = {
        message: 'File uploaded, transcribed, saved to Supabase, and processed by Crew agent',
        file: req.file.filename,
        path: filePath,
        transcript: transcript,
        transcriptFile: transcriptFile,
        supabaseResult: supabaseResult,
        crewResult: crewResult,
        tasks: actionItems.map(item => ({
          name: item.employee_name,
          task: item.task,
          due: item.deadline,
          employee_name: item.employee_name,
          task_description: item.task,
          due_date: item.deadline
        })),
        dbTasks: insertedTasks,
        dbError: dbError
      };

      res.status(200).json(responseData);
    });
  });
});

// POST /api/meetings/process/:id → fetch transcript + pass to CrewAI
app.post('/api/meetings/process/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch transcript and filename from Supabase
    const { data, error } = await supabase
      .from('meetings')
      .select('transcript, filename')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Transcript not found', error });
    }

    const { transcript, filename } = data;
    if (!transcript) {
      return res.status(400).json({ message: 'Transcript is empty' });
    }

    // Use Flask API instead of child process
    try {
      const flaskResponse = await axios.post('http://localhost:5001/process-transcript', { transcript });
      const crewResult = flaskResponse.data;
      // Print Crew agent output to terminal
      console.log('Crew agent output:', crewResult);
      // Email output is in crewResult.emails (array)
      if (crewResult.emails && crewResult.emails.length > 0) {
        await sendBatchEmails(crewResult.emails);
      }
      // You can return it to the frontend or process as needed
      return res.status(200).json({
        message: 'CrewAI processing complete',
        filename,
        transcript,
        crew_output: crewResult,
        emails: crewResult.emails || []
      });
    } catch (flaskErr) {
      console.error('CrewAI Flask API Error:', flaskErr);
      return res.status(500).json({
        message: 'CrewAI processing failed',
        error: flaskErr.message || flaskErr.toString(),
      });
    }
  } catch (err) {
    console.error('Process error:', err);
    res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
