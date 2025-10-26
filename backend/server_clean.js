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
const GmailService = require('./services/gmailService');
const GmailPollingService = require('./services/gmailPollingService');

const app = express();
const PORT = process.env.PORT || 5000;

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Gmail service instances
const gmailService = new GmailService();
const gmailPolling = new GmailPollingService();

// Gmail SMTP transporter
const mailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'http://localhost:3000',
    'https://saa-s-meeting-assistant.vercel.app',
    /\.vercel\.app$/,
    /\.onrender\.com$/
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
const apiRoutes = require('./routes/apiRoutes');
app.use('/api', apiRoutes);

// Gmail Setup Interface
app.get('/gmail-setup', (req, res) => {
    res.sendFile(path.join(__dirname, 'gmail-setup.html'));
});

// Gmail Polling Setup Interface
app.get('/gmail-polling', (req, res) => {
    res.sendFile(path.join(__dirname, 'gmail-polling-setup.html'));
});

// Health check endpoint for Docker
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve email reply test interface
app.get('/test/email-reply', (req, res) => {
  res.sendFile(path.join(__dirname, 'email-reply-test.html'));
});

// Debug endpoint to check/create user profile
app.post('/api/auth/ensure-profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    console.log('Checking profile for user:', user.id);

    // Check if profile exists
    const { data: existingProfile, error: checkError } = await supabase
      .from('user_profiles')
      .select(`
        *,
        companies (
          id,
          name
        )
      `)
      .eq('id', user.id)
      .maybeSingle();

    console.log('Profile check result:', { existingProfile, checkError });

    if (existingProfile) {
      return res.json({ profile: existingProfile, created: false });
    }

    // Call the database function to create profile (this should bypass RLS)
    const { data: result, error: functionError } = await supabase.rpc('handle_new_user_with_company_manual', {
      user_id: user.id,
      user_email: user.email,
      user_full_name: user.user_metadata?.full_name || user.email.split('@')[0],
      company_name: (user.user_metadata?.full_name?.split(' ')[0] || 'My') + "'s Company"
    });

    if (functionError) {
      console.log('Function error:', functionError);
      
      // Fallback: try creating manually with a different approach
      try {
        // Create company first with a simple insert
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .insert({ name: (user.user_metadata?.full_name?.split(' ')[0] || 'My') + "'s Company" })
          .select()
          .single();

        if (companyError) {
          console.log('Manual company creation error:', companyError);
          return res.status(500).json({ error: 'Failed to create company', details: companyError });
        }

        // Then create profile
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .insert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.email.split('@')[0],
            company_id: company.id
          })
          .select()
          .single();

        if (profileError) {
          console.log('Manual profile creation error:', profileError);
          return res.status(500).json({ error: 'Failed to create profile', details: profileError });
        }

        return res.json({ profile, company, created: true, method: 'manual' });
      } catch (fallbackError) {
        console.error('Fallback creation failed:', fallbackError);
        return res.status(500).json({ error: 'All profile creation methods failed', details: fallbackError.message });
      }
    }

    // If function succeeded, fetch the created profile
    const { data: newProfile, error: fetchError } = await supabase
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

    if (fetchError) {
      console.log('Failed to fetch created profile:', fetchError);
      return res.status(500).json({ error: 'Profile created but failed to fetch', details: fetchError });
    }

    console.log('Profile created via function:', newProfile);

    res.json({ profile: newProfile, created: true, method: 'function' });
  } catch (error) {
    console.error('Ensure profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to check user profiles
app.get('/api/debug/profiles', async (req, res) => {
  try {
    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select(`
        *,
        companies (
          id,
          name
        )
      `);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ profiles, count: profiles.length });
  } catch (error) {
    console.error('Debug profiles error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Configure file upload
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// Helper to send emails
async function sendBatchEmails(emailArray, taskIds = []) {
  if (!Array.isArray(emailArray) || emailArray.length === 0) return;
  
  const emailResults = [];
  
  for (let i = 0; i < emailArray.length; i++) {
    const email = emailArray[i];
    const taskId = taskIds[i]; // corresponding task ID
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email.employee_email,
      subject: email.subject,
      html: `<pre>${email.body}</pre>`
    };
    
    try {
      const info = await mailTransporter.sendMail(mailOptions);
      console.log('Email sent to', email.employee_email);
      console.log('Message ID:', info.messageId);
      
      // Store the message ID in the database if we have a task ID
      if (taskId && info.messageId) {
        try {
          await supabase
            .from('tasks')
            .update({ 
              email_message_id: info.messageId,
              email_sent_at: new Date().toISOString()
            })
            .eq('id', taskId);
          
          console.log(`✅ Stored message ID ${info.messageId} for task ${taskId}`);
        } catch (dbError) {
          console.error('Error storing message ID:', dbError);
        }
      }
      
      emailResults.push({
        employee_email: email.employee_email,
        message_id: info.messageId,
        task_id: taskId,
        status: 'sent'
      });
      
    } catch (err) {
      console.error('Error sending email to', email.employee_email, err);
      emailResults.push({
        employee_email: email.employee_email,
        message_id: null,
        task_id: taskId,
        status: 'failed',
        error: err.message
      });
    }
  }
  
  return emailResults;
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
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.log('Auth error:', userError);
      return res.status(401).json({ error: 'Invalid token' });
    }

    console.log('Authenticated user ID:', user.id);

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
      .maybeSingle();

    console.log('Profile query result:', { profile, profileError });

    if (profileError) {
      console.log('Profile error details:', profileError);
      return res.status(404).json({ error: 'Profile query failed', details: profileError.message });
    }

    if (!profile) {
      return res.status(404).json({ error: 'User profile not found - please create one first by calling /api/auth/ensure-profile' });
    }

    const companyId = profile.company_id;
    const companyName = profile.companies.name;

    const filePath = path.join(__dirname, 'uploads', req.file.filename);
    const transcriptsDir = path.join(__dirname, 'transcripts');
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir);
    }

    // Transcribe the file using HF Space with fallback
    exec(`python controllers/transcribe_hf.py "${filePath}"`, { cwd: __dirname }, async (error, stdout, stderr) => {
      if (stderr) console.log("Transcription debug:", stderr);
      
      let transcript = stdout ? stdout.trim() : null;
      
      // If HF Space fails, try fallback transcription
      if (error || !transcript) {
        console.log("HF Space failed, trying fallback transcription...");
        
        try {
          const fallbackResult = await new Promise((resolve, reject) => {
            exec(`python controllers/transcribe_openai.py "${filePath}"`, { cwd: __dirname }, (error, stdout, stderr) => {
              if (error) {
                reject(error);
              } else {
                resolve(stdout.trim());
              }
            });
          });
          
          transcript = fallbackResult;
          console.log("Fallback transcription successful");
        } catch (fallbackError) {
          return res.status(500).json({ 
            message: 'Both primary and fallback transcription failed', 
            error: stderr || error.message,
            fallbackError: fallbackError.message
          });
        }
      }

      if (!transcript) {
        return res.status(500).json({ 
          message: 'No transcript generated', 
          error: 'Empty transcript result'
        });
      }

      // Save meeting with company context
      const { data: meetingData, error: meetingError } = await supabase
        .from('meetings')
        .insert({
          filename: req.file.originalname,
          transcript: transcript,
          user_id: user.id,
          company_id: companyId
        })
        .select()
        .single();

      if (meetingError) {
        return res.status(500).json({ error: 'Failed to save meeting' });
      }

      // Get company employees for AI context
      const { data: employees } = await supabase
        .from('employees')
        .select('*')
        .eq('company_id', companyId);

      try {
        // Call AI agent with company context
        const aiResponse = await axios.post('http://localhost:5001/process-transcript', {
          transcript: transcript,
          company_id: companyId,
          user_id: user.id,
          meta: {
            meeting_id: meetingData.id,
            filename: req.file.originalname,
            company_name: companyName,
            employees: employees || []
          }
        });

        const crewResult = aiResponse.data;

        // Log the full agent JSON output to terminal for debugging
        console.log('='.repeat(80));
        console.log('🤖 AGENT JSON OUTPUT:');
        console.log('='.repeat(80));
        console.log(JSON.stringify(crewResult, null, 2));
        console.log('='.repeat(80));

        // Update meeting with summary
        if (crewResult.meeting_summary && crewResult.meeting_summary.summary) {
          await supabase
            .from('meetings')
            .update({ summary: crewResult.meeting_summary.summary })
            .eq('id', meetingData.id);
        }

        // Tasks are already saved by crew.py, just get the count
        const insertedTasks = crewResult.saved_tasks || [];

        // Send emails if available
        if (crewResult.emails && crewResult.emails.length > 0) {
          // Instead of relying on crew.py for task IDs, query the database for recently created tasks
          console.log('📧 DEBUG: Getting task IDs from database...');
          
          const { data: recentTasks, error: taskQueryError } = await supabase
            .from('tasks')
            .select(`
              id, 
              employee_id, 
              task_description,
              employees (
                name,
                email
              )
            `)
            .eq('meeting_id', meetingData.id)
            .order('created_at', { ascending: false });

          if (taskQueryError) {
            console.error('Error fetching recent tasks:', taskQueryError);
          } else {
            console.log('Recent tasks from DB:', JSON.stringify(recentTasks, null, 2));
          }

          // Map task IDs to emails using the database tasks
          const taskIds = [];
          console.log('Emails to send:', JSON.stringify(crewResult.emails, null, 2));
          
          for (let i = 0; i < crewResult.emails.length; i++) {
            const email = crewResult.emails[i];
            console.log(`\n🔍 Processing email ${i + 1}:`, email);
            
            // Find matching task from database
            let matchingTask = null;
            
            if (recentTasks) {
              // Strategy 1: Match by employee name from the employees table
              matchingTask = recentTasks.find(task => 
                task.employees && task.employees.name === email.employee_name
              );
              console.log('Strategy 1 (employee name):', matchingTask ? 'FOUND' : 'NOT FOUND');
              
              // Strategy 2: Match by employee email
              if (!matchingTask) {
                matchingTask = recentTasks.find(task => 
                  task.employees && task.employees.email === email.employee_email
                );
                console.log('Strategy 2 (employee email):', matchingTask ? 'FOUND' : 'NOT FOUND');
              }
              
              // Strategy 3: If not found, try by index (if same order)
              if (!matchingTask && recentTasks[i]) {
                matchingTask = recentTasks[i];
                console.log('Strategy 3 (index):', matchingTask ? 'FOUND' : 'NOT FOUND');
              }
            }
            
            const taskId = matchingTask ? matchingTask.id : null;
            taskIds.push(taskId);
            
            console.log(`✅ Task ID for email ${i + 1}:`, taskId);
          }
          
          console.log('📋 Final taskIds array:', taskIds);
          
          const emailResults = await sendBatchEmails(crewResult.emails, taskIds);
          console.log('Email sending results:', emailResults);
        }

        res.json({
          success: true,
          message: 'Meeting processed successfully',
          meeting: meetingData,
          summary: crewResult.meeting_summary?.summary,
          tasks: insertedTasks,
          emailsSent: crewResult.emails ? crewResult.emails.length : 0,
          crewResult: crewResult  // Include full agent output for frontend debugging
        });

      } catch (crewError) {
        console.error('Crew agent error:', crewError);
        res.json({
          success: false,
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

// GET /api/tasks - Get tasks for authenticated user's company
app.get('/api/tasks', async (req, res) => {
  try {
    // Get user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user profile with company info
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Get tasks for the company with employee information
    let query = supabase
      .from('tasks')
      .select(`
        *,
        employees (
          id,
          name,
          email
        )
      `)
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false });

    // Apply filters
    if (req.query.status && req.query.status !== 'all') {
      query = query.eq('status', req.query.status);
    }

    if (req.query.search) {
      query = query.or(`title.ilike.%${req.query.search}%,task_description.ilike.%${req.query.search}%`);
    }

    const { data: tasks, error: tasksError } = await query;

    if (tasksError) {
      return res.status(500).json({ error: 'Failed to fetch tasks', details: tasksError.message });
    }

    res.json({ 
      tasks: tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.task_description,
        status: task.status,
        priority: task.priority || 'medium',
        due_date: task.due_date,
        assigned_to: task.assigned_to,
        employee_id: task.employee_id,
        employee: task.employees ? {
          id: task.employees.id,
          name: task.employees.name,
          email: task.employees.email
        } : null,
        created_at: task.created_at,
        updated_at: task.updated_at
      }))
    });

  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/tasks/:id - Update task
app.put('/api/tasks/:id', async (req, res) => {
  try {
    // Get user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user profile with company info
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const { id } = req.params;
    const updates = req.body;

    // Update task (only for tasks in user's company)
    const { data: task, error: updateError } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .eq('company_id', profile.company_id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update task', details: updateError.message });
    }

    res.json({ 
      success: true,
      task: {
        id: task.id,
        title: task.title,
        description: task.task_description,
        status: task.status,
        priority: task.priority || 'medium',
        due_date: task.due_date,
        assigned_to: task.assigned_to,
        created_at: task.created_at,
        updated_at: task.updated_at
      }
    });

  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/tasks - Create new task
app.post('/api/tasks', async (req, res) => {
  try {
    // Get user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user profile with company info
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const { title, description, priority, due_date, assigned_to } = req.body;

    // Create task
    const { data: task, error: createError } = await supabase
      .from('tasks')
      .insert({
        title,
        task_description: description,
        priority: priority || 'medium',
        due_date,
        assigned_to,
        status: 'pending',
        company_id: profile.company_id,
        meeting_id: null // Manual task, not from meeting
      })
      .select()
      .single();

    if (createError) {
      return res.status(500).json({ error: 'Failed to create task', details: createError.message });
    }

    res.json({ 
      success: true,
      task: {
        id: task.id,
        title: task.title,
        description: task.task_description,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
        assigned_to: task.assigned_to,
        created_at: task.created_at,
        updated_at: task.updated_at
      }
    });

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/tasks/:id - Delete task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    // Get user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user profile with company info
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const { id } = req.params;

    // Delete task (only for tasks in user's company)
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('company_id', profile.company_id);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete task', details: deleteError.message });
    }

    res.json({ success: true, message: 'Task deleted successfully' });

  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Gmail API Routes for Production Email Reply Tracking

// Gmail OAuth setup - get authorization URL
app.get('/api/gmail/auth', (req, res) => {
  try {
    const authUrl = gmailService.getAuthUrl();
    console.log('🔗 Generated Auth URL:', authUrl);
    console.log('🔗 Expected Redirect URI:', process.env.GMAIL_REDIRECT_URI);
    res.json({ 
      success: true, 
      authUrl: authUrl,
      redirectUri: process.env.GMAIL_REDIRECT_URI,
      message: 'Visit this URL to authorize Gmail access'
    });
  } catch (error) {
    console.error('Gmail auth error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Gmail OAuth callback - exchange code for tokens
app.get('/auth/gmail/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code required' });
    }

    const tokens = await gmailService.getTokens(code);
    
    res.json({
      success: true,
      message: 'Gmail authorization successful! Save these tokens to your .env file.',
      tokens: {
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token
      },
      instructions: `Add this to your .env file: GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`
    });
  } catch (error) {
    console.error('Gmail callback error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Setup Gmail webhook for real-time email notifications
app.post('/api/gmail/setup-webhook', async (req, res) => {
  try {
    const result = await gmailService.setupWebhook();
    res.json({ 
      success: true, 
      message: 'Gmail webhook setup successful',
      data: result
    });
  } catch (error) {
    console.error('Gmail webhook setup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Gmail webhook endpoint - receives notifications from Google Pub/Sub
app.post('/api/gmail/webhook', async (req, res) => {
  try {
    console.log('📨 Received Gmail webhook notification');
    
    // Verify the request is from Google (basic check)
    const userAgent = req.headers['user-agent'];
    if (!userAgent || !userAgent.includes('Google')) {
      console.log('⚠️ Invalid user agent:', userAgent);
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Process the webhook notification
    const message = req.body.message;
    if (message) {
      await gmailService.processWebhookNotification(message);
    }

    // Acknowledge receipt
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Gmail webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual email check endpoint (for testing/backup)
app.post('/api/gmail/check-emails', async (req, res) => {
  try {
    const { startHistoryId } = req.body;
    
    if (startHistoryId) {
      await gmailService.processHistoryChanges(startHistoryId);
    } else {
      // If no history ID provided, just acknowledge
      console.log('No history ID provided for manual email check');
    }

    res.json({ 
      success: true, 
      message: 'Manual email check completed'
    });
  } catch (error) {
    console.error('Manual email check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stop Gmail webhook
app.post('/api/gmail/stop-webhook', async (req, res) => {
  try {
    await gmailService.stopWatch();
    res.json({ 
      success: true, 
      message: 'Gmail webhook stopped'
    });
  } catch (error) {
    console.error('Gmail stop webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to handle email replies and update task status
app.post('/api/email/reply', async (req, res) => {
  try {
    const { 
      messageId,          // Message-ID from reply
      inReplyTo,          // In-Reply-To header (our original message ID)
      from,               // Sender's email
      subject,            // Reply subject
      body,               // Reply body text
      headers            // All email headers
    } = req.body;

    console.log('📧 Processing email reply:', { inReplyTo, from, subject });

    if (!inReplyTo) {
      return res.status(400).json({ error: 'In-Reply-To header required' });
    }

    // Find the task by original message ID
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select(`
        id,
        task_description,
        status,
        employee_id,
        employees (
          name,
          email
        )
      `)
      .eq('email_message_id', inReplyTo);

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!tasks || tasks.length === 0) {
      console.log('❌ No task found for message ID:', inReplyTo);
      return res.status(404).json({ error: 'Task not found for this email' });
    }

    const task = tasks[0];
    console.log('✅ Found task:', task.task_description);

    // Parse the reply content to determine status
    const replyText = (body || '').toLowerCase();
    let newStatus = task.status; // default to current status
    
    if (replyText.includes('completed') || replyText.includes('done') || replyText.includes('finished')) {
      newStatus = 'completed';
    } else if (replyText.includes('in progress') || replyText.includes('working')) {
      newStatus = 'in_progress';
    } else if (replyText.includes('blocked') || replyText.includes('stuck')) {
      newStatus = 'blocked';
    }

    // Update the task status
    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update({ 
        status: newStatus,
        last_reply_at: new Date().toISOString(),
        last_reply_message_id: messageId,
        last_reply_content: body
      })
      .eq('id', task.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating task:', updateError);
      return res.status(500).json({ error: 'Failed to update task' });
    }

    console.log(`✅ Updated task ${task.id} status: ${task.status} → ${newStatus}`);

    res.json({
      success: true,
      message: `Task status updated to ${newStatus}`,
      task: updatedTask,
      originalStatus: task.status,
      newStatus: newStatus
    });

  } catch (error) {
    console.error('Error processing email reply:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to simulate email reply (for testing)
app.post('/api/test/email-reply', async (req, res) => {
  try {
    const { 
      taskId,
      replyContent = 'completed',
      fromEmail 
    } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: 'taskId required' });
    }

    // Get the task to find its message ID
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, email_message_id, task_description, status')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!task.email_message_id) {
      return res.status(400).json({ error: 'Task has no email message ID - email was not sent' });
    }

    // Simulate an email reply by calling our reply endpoint
    const replyPayload = {
      messageId: 'test-reply-' + Date.now() + '@test.com',
      inReplyTo: task.email_message_id,
      from: fromEmail || 'test@employee.com',
      subject: `Re: Task Assignment - ${task.task_description}`,
      body: replyContent,
      headers: {
        'message-id': 'test-reply-' + Date.now() + '@test.com',
        'in-reply-to': task.email_message_id
      }
    };

    // Call our own email reply endpoint
    const replyResponse = await axios.post('http://localhost:5000/api/email/reply', replyPayload);

    res.json({
      success: true,
      message: 'Simulated email reply processed',
      originalTask: task,
      replyPayload: replyPayload,
      replyResult: replyResponse.data
    });

  } catch (error) {
    console.error('Test email reply error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to get tasks with email message IDs
app.get('/api/debug/get-tasks-with-emails', async (req, res) => {
  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select(`
        id,
        task_description,
        status,
        employee_id,
        email_message_id,
        email_sent_at,
        last_reply_at,
        employees (
          name,
          email
        )
      `)
      .not('email_message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ 
      tasks: tasks || [],
      count: tasks ? tasks.length : 0,
      message: tasks && tasks.length > 0 ? 'Found tasks with email tracking' : 'No tasks with email message IDs found'
    });
  } catch (error) {
    console.error('Debug get tasks with emails error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to check employees
app.get('/api/debug/employees', async (req, res) => {
  try {
    const { data: employees, error } = await supabase
      .from('employees')
      .select('*');

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ employees, count: employees.length });
  } catch (error) {
    console.error('Debug employees error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to add test employees
app.post('/api/debug/add-employees', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user profile with company info
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Add some test employees
    const testEmployees = [
      { name: 'John Doe', email: 'john@company.com', company_id: profile.company_id },
      { name: 'Jane Smith', email: 'jane@company.com', company_id: profile.company_id },
      { name: 'Bob Johnson', email: 'bob@company.com', company_id: profile.company_id }
    ];

    const { data: employees, error: insertError } = await supabase
      .from('employees')
      .insert(testEmployees)
      .select();

    if (insertError) {
      return res.status(500).json({ error: 'Failed to add employees', details: insertError.message });
    }

    res.json({ success: true, employees });
  } catch (error) {
    console.error('Add employees error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Gmail Polling Routes for Email Reply Tracking

// Start Gmail polling
app.post('/api/gmail/start-polling', async (req, res) => {
  try {
    const { intervalMinutes = 2 } = req.body;
    
    await gmailPolling.startPolling(intervalMinutes);
    
    res.json({ 
      success: true, 
      message: `Gmail polling started with ${intervalMinutes} minute interval`,
      status: gmailPolling.getStatus()
    });
  } catch (error) {
    console.error('Start polling error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stop Gmail polling
app.post('/api/gmail/stop-polling', async (req, res) => {
  try {
    await gmailPolling.stopPolling();
    
    res.json({ 
      success: true, 
      message: 'Gmail polling stopped',
      status: gmailPolling.getStatus()
    });
  } catch (error) {
    console.error('Stop polling error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual email check
app.post('/api/gmail/check-now', async (req, res) => {
  try {
    await gmailPolling.checkNow();
    
    res.json({ 
      success: true, 
      message: 'Manual email check completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Manual check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get polling status
app.get('/api/gmail/polling-status', (req, res) => {
  try {
    const status = gmailPolling.getStatus();
    res.json({ success: true, status });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to check Gmail configuration
app.get('/api/gmail/debug-config', (req, res) => {
  try {
    res.json({
      success: true,
      config: {
        clientId: process.env.GMAIL_CLIENT_ID ? 'Set' : 'Not set',
        clientSecret: process.env.GMAIL_CLIENT_SECRET ? 'Set' : 'Not set',
        redirectUri: process.env.GMAIL_REDIRECT_URI,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN !== 'your_gmail_refresh_token_here' ? 'Set' : 'Not set'
      }
    });
  } catch (error) {
    console.error('Debug config error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recent task updates from email replies
app.get('/api/gmail/recent-updates', async (req, res) => {
  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select(`
        id,
        task_description,
        status,
        last_reply_at,
        last_reply_content,
        employees (
          name,
          email
        )
      `)
      .not('last_reply_at', 'is', null)
      .order('last_reply_at', { ascending: false })
      .limit(20);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ 
      success: true, 
      updates: tasks || [],
      count: tasks?.length || 0
    });
  } catch (error) {
    console.error('Recent updates error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('🚀 Gmail polling service initialized');
  
  // Auto-start polling if credentials are configured
  if (process.env.GMAIL_REFRESH_TOKEN && process.env.GMAIL_REFRESH_TOKEN !== 'your_gmail_refresh_token_here') {
    console.log('📧 Auto-starting Gmail polling...');
    setTimeout(() => {
      gmailPolling.startPolling(2); // Start with 2-minute intervals
    }, 5000); // Wait 5 seconds for server to fully start
  } else {
    console.log('⚠️ Gmail credentials not configured. Please set up OAuth first.');
  }
});