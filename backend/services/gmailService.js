const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

class GmailService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );

    // Set refresh token
    this.oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN
    });

    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  /**
   * Set up Gmail webhook to receive notifications for new emails
   */
  async setupWebhook() {
    try {
      console.log('🔔 Setting up Gmail webhook...');

      // Stop any existing watch
      await this.stopWatch().catch(() => {
        console.log('No existing watch to stop');
      });

      // Set up new watch
      const watchRequest = {
        userId: 'me',
        requestBody: {
          topicName: process.env.GMAIL_TOPIC_NAME,
          labelIds: ['INBOX'],
          labelFilterAction: 'include'
        }
      };

      const response = await this.gmail.users.watch(watchRequest);
      console.log('✅ Gmail webhook setup successful:', response.data);
      
      return response.data;
    } catch (error) {
      console.error('❌ Error setting up Gmail webhook:', error.message);
      throw error;
    }
  }

  /**
   * Stop Gmail webhook
   */
  async stopWatch() {
    try {
      const response = await this.gmail.users.stop({ userId: 'me' });
      console.log('🛑 Gmail webhook stopped:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error stopping Gmail watch:', error.message);
      throw error;
    }
  }

  /**
   * Process Gmail webhook notification
   */
  async processWebhookNotification(message) {
    try {
      console.log('📧 Processing Gmail webhook notification:', message);

      // Decode the Pub/Sub message
      const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
      
      if (!data.emailAddress || !data.historyId) {
        console.log('Invalid notification data');
        return;
      }

      // Get the history of changes since the last known historyId
      await this.processHistoryChanges(data.historyId);

    } catch (error) {
      console.error('Error processing webhook notification:', error);
      throw error;
    }
  }

  /**
   * Process Gmail history changes to find new emails
   */
  async processHistoryChanges(startHistoryId) {
    try {
      console.log('📜 Processing Gmail history changes from:', startHistoryId);

      const response = await this.gmail.users.history.list({
        userId: 'me',
        startHistoryId: startHistoryId,
        historyTypes: ['messageAdded']
      });

      const history = response.data.history || [];

      for (const historyRecord of history) {
        if (historyRecord.messagesAdded) {
          for (const messageAdded of historyRecord.messagesAdded) {
            await this.processNewMessage(messageAdded.message.id);
          }
        }
      }

    } catch (error) {
      console.error('Error processing history changes:', error);
      throw error;
    }
  }

  /**
   * Process a new email message
   */
  async processNewMessage(messageId) {
    try {
      console.log('📬 Processing new message:', messageId);

      // Get the full message
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const message = response.data;
      const headers = message.payload.headers;

      // Extract relevant headers
      const from = this.getHeader(headers, 'From');
      const to = this.getHeader(headers, 'To');
      const subject = this.getHeader(headers, 'Subject');
      const messageIdHeader = this.getHeader(headers, 'Message-ID');
      const inReplyTo = this.getHeader(headers, 'In-Reply-To');
      const references = this.getHeader(headers, 'References');

      console.log('📧 Email details:', { from, to, subject, messageIdHeader, inReplyTo });

      // Check if this is a reply to one of our task emails
      if (inReplyTo || references) {
        const originalMessageId = inReplyTo || (references ? references.split(' ').pop() : null);
        
        if (originalMessageId) {
          // Extract email body
          const body = await this.extractEmailBody(message.payload);
          
          // Process the reply
          await this.processEmailReply({
            messageId: messageIdHeader,
            inReplyTo: originalMessageId,
            from: from,
            subject: subject,
            body: body,
            headers: Object.fromEntries(headers.map(h => [h.name, h.value]))
          });
        }
      }

    } catch (error) {
      console.error('Error processing new message:', error);
      throw error;
    }
  }

  /**
   * Extract email body from message payload
   */
  async extractEmailBody(payload) {
    let body = '';

    try {
      if (payload.body && payload.body.data) {
        // Single part message
        body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      } else if (payload.parts) {
        // Multi-part message
        for (const part of payload.parts) {
          if (part.mimeType === 'text/plain' && part.body.data) {
            body += Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
        }
      }

      // Clean up the body
      body = body.replace(/\r\n/g, '\n').trim();
      
    } catch (error) {
      console.error('Error extracting email body:', error);
      body = '';
    }

    return body;
  }

  /**
   * Process email reply and update task status
   */
  async processEmailReply(emailData) {
    try {
      console.log('🔄 Processing email reply:', emailData);

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
        .eq('email_message_id', emailData.inReplyTo);

      if (error) {
        console.error('Database error:', error);
        return;
      }

      if (!tasks || tasks.length === 0) {
        console.log('❌ No task found for message ID:', emailData.inReplyTo);
        return;
      }

      const task = tasks[0];
      console.log('✅ Found task:', task.task_description);

      // Parse the reply content to determine status
      const replyText = (emailData.body || '').toLowerCase();
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
          last_reply_message_id: emailData.messageId,
          last_reply_content: emailData.body
        })
        .eq('id', task.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating task:', updateError);
        return;
      }

      console.log(`✅ Updated task ${task.id} status: ${task.status} → ${newStatus}`);

      return {
        success: true,
        message: `Task status updated to ${newStatus}`,
        task: updatedTask,
        originalStatus: task.status,
        newStatus: newStatus
      };

    } catch (error) {
      console.error('Error processing email reply:', error);
      throw error;
    }
  }

  /**
   * Helper function to get header value
   */
  getHeader(headers, name) {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : null;
  }

  /**
   * Get Gmail authorization URL for OAuth setup
   */
  getAuthUrl() {
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokens(code) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      console.log('🔐 Gmail tokens obtained:', tokens);
      return tokens;
    } catch (error) {
      console.error('Error getting tokens:', error);
      throw error;
    }
  }
}

module.exports = GmailService;