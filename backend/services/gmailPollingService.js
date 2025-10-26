const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

class GmailPollingService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );
        
        this.gmail = null;
        this.isPolling = false;
        this.pollingInterval = null;
        this.lastMessageId = null;
        
        // Keywords that indicate task completion
        this.completionKeywords = [
            'completed', 'done', 'finished', 'complete', 'ready',
            'accomplished', 'resolved', 'closed', 'delivered',
            'success', 'successful', 'achieved', 'fixed'
        ];
        
        // Keywords that indicate task is pending/in progress
        this.progressKeywords = [
            'working on', 'in progress', 'started', 'begun',
            'proceeding', 'ongoing', 'underway', 'processing'
        ];
        
        this.initializeGmail();
    }

    async initializeGmail() {
        try {
            const oauth2Client = new google.auth.OAuth2(
                process.env.GMAIL_CLIENT_ID,
                process.env.GMAIL_CLIENT_SECRET,
                process.env.GMAIL_REDIRECT_URI
            );

            // Set credentials if refresh token is available
            if (process.env.GMAIL_REFRESH_TOKEN && process.env.GMAIL_REFRESH_TOKEN !== 'your_gmail_refresh_token_here') {
                oauth2Client.setCredentials({
                    refresh_token: process.env.GMAIL_REFRESH_TOKEN
                });

                this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
                console.log('✅ Gmail API initialized successfully');
                
                // Start polling automatically if credentials are set
                this.startPolling();
            } else {
                console.log('⚠️ Gmail refresh token not set. Please authorize first.');
            }
        } catch (error) {
            console.error('❌ Failed to initialize Gmail API:', error.message);
        }
    }

    async startPolling(intervalMinutes = 2) {
        if (this.isPolling) {
            console.log('📧 Gmail polling already running');
            return;
        }

        if (!this.gmail) {
            console.log('❌ Gmail not initialized. Cannot start polling.');
            return;
        }

        this.isPolling = true;
        const intervalMs = intervalMinutes * 60 * 1000; // Convert to milliseconds
        
        console.log(`🚀 Starting Gmail polling every ${intervalMinutes} minutes`);
        
        // Initial check
        await this.checkForNewReplies();
        
        // Set up interval
        this.pollingInterval = setInterval(async () => {
            await this.checkForNewReplies();
        }, intervalMs);
    }

    async stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.isPolling = false;
        console.log('⏹️ Gmail polling stopped');
    }

    async checkForNewReplies() {
        try {
            console.log('🔍 Checking for new email replies...');
            
            // Get messages from the last 24 hours
            const query = `to:${process.env.EMAIL_USER} newer_than:1d`;
            
            const response = await this.gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: 50
            });

            const messages = response.data.messages || [];
            console.log(`📬 Found ${messages.length} recent messages`);

            for (const message of messages) {
                await this.processMessage(message.id);
            }

        } catch (error) {
            console.error('❌ Error checking for replies:', error.message);
        }
    }

    async processMessage(messageId) {
        try {
            const message = await this.gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full'
            });

            const headers = message.data.payload.headers;
            
            // Get email metadata
            const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
            const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
            const messageIdHeader = headers.find(h => h.name.toLowerCase() === 'message-id');
            const inReplyToHeader = headers.find(h => h.name.toLowerCase() === 'in-reply-to');
            const referencesHeader = headers.find(h => h.name.toLowerCase() === 'references');

            if (!fromHeader || !inReplyToHeader) {
                return; // Not a reply or missing required headers
            }

            const fromEmail = this.extractEmail(fromHeader.value);
            const subject = subjectHeader?.value || '';
            const currentMessageId = messageIdHeader?.value;
            const inReplyTo = inReplyToHeader.value;
            const references = referencesHeader?.value || '';

            console.log(`📧 Processing reply from: ${fromEmail}`);
            console.log(`📧 In reply to: ${inReplyTo}`);

            // Get email body
            const emailBody = this.extractEmailBody(message.data.payload);
            console.log(`📄 Email body: ${emailBody.substring(0, 200)}...`);

            // Find the original task using the in-reply-to message ID
            const { data: tasks, error } = await this.supabase
                .from('tasks')
                .select(`
                    *,
                    employees (
                        id,
                        name,
                        email
                    )
                `)
                .eq('email_message_id', inReplyTo);

            if (error) {
                console.error('❌ Database error:', error);
                return;
            }

            if (!tasks || tasks.length === 0) {
                // Try to find using references header
                const referenceIds = references.split(/\s+/);
                for (const refId of referenceIds) {
                    const { data: refTasks } = await this.supabase
                        .from('tasks')
                        .select(`
                            *,
                            employees (
                                id,
                                name,
                                email
                            )
                        `)
                        .eq('email_message_id', refId.trim());
                    
                    if (refTasks && refTasks.length > 0) {
                        await this.updateTaskFromReply(refTasks[0], emailBody, fromEmail, currentMessageId);
                        return;
                    }
                }
                
                console.log(`⚠️ No task found for reply message ID: ${inReplyTo}`);
                return;
            }

            const task = tasks[0];
            
            // Verify the reply is from the assigned employee
            if (task.employees.email.toLowerCase() !== fromEmail.toLowerCase()) {
                console.log(`⚠️ Reply from ${fromEmail} doesn't match assigned employee ${task.employees.email}`);
                return;
            }

            await this.updateTaskFromReply(task, emailBody, fromEmail, currentMessageId);

        } catch (error) {
            console.error('❌ Error processing message:', error.message);
        }
    }

    async updateTaskFromReply(task, emailBody, fromEmail, replyMessageId) {
        try {
            console.log(`🔄 Processing reply for task: ${task.task_description}`);
            
            const emailLower = emailBody.toLowerCase();
            let newStatus = task.status;
            let statusReason = '';

            // Check for completion keywords
            const completionFound = this.completionKeywords.some(keyword => {
                if (emailLower.includes(keyword)) {
                    statusReason = `Email reply contained: "${keyword}"`;
                    return true;
                }
                return false;
            });

            if (completionFound) {
                newStatus = 'completed';
            } else {
                // Check for progress keywords
                const progressFound = this.progressKeywords.some(keyword => {
                    if (emailLower.includes(keyword)) {
                        statusReason = `Email reply contained: "${keyword}"`;
                        return true;
                    }
                    return false;
                });

                if (progressFound) {
                    newStatus = 'in_progress';
                } else {
                    // Default to acknowledging the reply
                    statusReason = 'Employee replied to task email';
                }
            }

            // Update the task in database
            const { data, error } = await this.supabase
                .from('tasks')
                .update({
                    status: newStatus,
                    last_reply_at: new Date().toISOString(),
                    last_reply_message_id: replyMessageId,
                    last_reply_content: emailBody.substring(0, 1000) // Store first 1000 chars
                })
                .eq('id', task.id)
                .select();

            if (error) {
                console.error('❌ Failed to update task:', error);
                return;
            }

            console.log(`✅ Task updated successfully!`);
            console.log(`   Task: ${task.task_description}`);
            console.log(`   Employee: ${task.employees.name} (${fromEmail})`);
            console.log(`   Status: ${task.status} → ${newStatus}`);
            console.log(`   Reason: ${statusReason}`);

            // Log the activity
            await this.logTaskActivity(task.id, {
                action: 'email_reply_received',
                old_status: task.status,
                new_status: newStatus,
                reply_content: emailBody.substring(0, 500),
                from_email: fromEmail,
                message_id: replyMessageId,
                reason: statusReason
            });

        } catch (error) {
            console.error('❌ Error updating task from reply:', error.message);
        }
    }

    async logTaskActivity(taskId, activity) {
        try {
            await this.supabase
                .from('task_activities')
                .insert({
                    task_id: taskId,
                    activity_type: activity.action,
                    activity_data: activity,
                    created_at: new Date().toISOString()
                });
        } catch (error) {
            console.log('⚠️ Could not log activity (table may not exist):', error.message);
        }
    }

    extractEmail(fromHeader) {
        // Extract email from "Name <email@domain.com>" format
        const match = fromHeader.match(/<([^>]+)>/);
        return match ? match[1] : fromHeader;
    }

    extractEmailBody(payload) {
        let body = '';
        
        if (payload.body && payload.body.data) {
            body = Buffer.from(payload.body.data, 'base64').toString();
        } else if (payload.parts) {
            for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' && part.body && part.body.data) {
                    body = Buffer.from(part.body.data, 'base64').toString();
                    break;
                } else if (part.parts) {
                    // Recursive search for nested parts
                    body = this.extractEmailBody(part);
                    if (body) break;
                }
            }
        }
        
        // Clean up the body text
        return body
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    // Manual check method for testing
    async checkNow() {
        console.log('🔄 Manual email check triggered');
        await this.checkForNewReplies();
    }

    // Status methods
    getStatus() {
        return {
            isPolling: this.isPolling,
            gmailInitialized: !!this.gmail,
            lastCheck: new Date().toISOString()
        };
    }
}

module.exports = GmailPollingService;