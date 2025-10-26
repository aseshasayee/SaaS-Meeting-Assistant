# Email Reply Tracking System

This system enables automatic task status updates when employees reply to task assignment emails.

## 🔄 How It Works

1. **Task Assignment**: CrewAI agent assigns tasks to employees
2. **Email Sending**: System sends task emails and stores Message-ID
3. **Reply Processing**: Incoming email replies are matched to original tasks
4. **Status Update**: Task status is automatically updated based on reply content

## 📧 Email Flow

```
[Task Created] → [Email Sent + Message-ID Stored] → [Employee Replies] → [Status Updated]
```

## 🗄️ Database Schema

The `tasks` table has been extended with email tracking columns:

```sql
-- Email tracking columns
email_message_id VARCHAR(255)     -- Message-ID from sent email
email_sent_at TIMESTAMP          -- When email was sent
last_reply_at TIMESTAMP          -- Last reply timestamp
last_reply_message_id VARCHAR(255) -- Message-ID of last reply
last_reply_content TEXT          -- Content of last reply
```

## 🔧 API Endpoints

### Send Email Reply
```
POST /api/email/reply
```

**Payload:**
```json
{
  "messageId": "reply-123@gmail.com",
  "inReplyTo": "original-message-id@gmail.com",
  "from": "employee@company.com",
  "subject": "Re: Task Assignment",
  "body": "Task completed successfully!",
  "headers": {
    "message-id": "reply-123@gmail.com",
    "in-reply-to": "original-message-id@gmail.com"
  }
}
```

### Test Email Reply (Simulation)
```
POST /api/test/email-reply
```

**Payload:**
```json
{
  "taskId": "task-uuid",
  "replyContent": "completed",
  "fromEmail": "employee@company.com"
}
```

## 🎯 Status Recognition

The system automatically detects status keywords in email replies:

| Keywords | Status |
|----------|--------|
| "completed", "done", "finished" | `completed` |
| "in progress", "working" | `in_progress` |
| "blocked", "stuck" | `blocked` |

## 🧪 Testing

### Web Interface
Visit: `http://localhost:3000/test/email-reply`

This provides a user-friendly interface to:
1. View tasks with email tracking
2. Simulate email replies
3. Test status updates

### Manual Testing
```bash
# Get tasks with email message IDs
curl http://localhost:3000/api/debug/get-tasks-with-emails

# Simulate reply
curl -X POST http://localhost:3000/api/test/email-reply \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "your-task-id",
    "replyContent": "This task is completed",
    "fromEmail": "test@employee.com"
  }'
```

## 🚀 Production Setup

### Email Provider Integration

For production, you'll need to integrate with your email provider's webhook system:

#### Gmail API
```javascript
// Set up Gmail API webhook
const gmail = google.gmail({version: 'v1', auth});
gmail.users.watch({
  userId: 'me',
  requestBody: {
    topicName: 'projects/your-project/topics/gmail-webhook'
  }
});
```

#### Office 365
```javascript
// Set up Office 365 webhook
const subscription = {
  changeType: 'created',
  notificationUrl: 'https://your-domain.com/api/email/reply',
  resource: 'me/mailFolders/inbox/messages'
};
```

### IMAP Polling (Alternative)
```javascript
const imap = require('imap-simple');

// Poll for new emails
const connection = await imap.connect(config);
const messages = await connection.search(['UNSEEN'], {
  bodies: 'HEADER.FIELDS (MESSAGE-ID IN-REPLY-TO FROM SUBJECT)',
  markSeen: true
});
```

## 🔐 Security Considerations

1. **Authentication**: Verify webhook signatures from email providers
2. **Rate Limiting**: Implement rate limiting on reply endpoints
3. **Validation**: Validate In-Reply-To headers match existing message IDs
4. **Sanitization**: Sanitize email content before database storage

## 📊 Monitoring

Key metrics to track:
- Email delivery rate
- Reply processing time
- Status update accuracy
- Failed webhook deliveries

## 🐛 Troubleshooting

### Common Issues

**No Message-ID stored:**
- Check if `sendBatchEmails` is called with `taskIds` parameter
- Verify nodemailer configuration

**Replies not matching tasks:**
- Ensure In-Reply-To header is preserved
- Check if email client modifies Message-ID format

**Status not updating:**
- Verify keyword detection logic
- Check database column permissions

### Debug Endpoints

```bash
# Check tasks with email tracking
GET /api/debug/get-tasks-with-emails

# View all employees
GET /api/debug/employees

# Test webhook
POST /api/test/email-reply
```

## 📝 Future Enhancements

1. **Smart Parsing**: NLP-based content analysis for better status detection
2. **Attachments**: Handle email attachments as task updates
3. **Threading**: Support for email thread conversations
4. **Analytics**: Task completion trends and email response analysis
5. **Templates**: Customizable email templates per task type