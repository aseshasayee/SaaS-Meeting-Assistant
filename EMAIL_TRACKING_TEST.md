# Email Reply Tracking Test

This test will verify the complete email tracking workflow:

1. Upload a meeting transcript
2. Have the AI agent create tasks and send emails 
3. Capture the message IDs in the database
4. Simulate an email reply 
5. Verify task status is updated

## Test Steps

You can now test the email reply tracking system:

### 1. Visit the Test Interface
Open your browser and go to: **http://localhost:5000/test/email-reply**

### 2. Upload a Meeting First
Before testing email replies, you need some tasks with emails sent. Upload a meeting through your main application to generate tasks.

### 3. Use the Test Interface
The test interface will:
- Show you tasks that have email message IDs
- Let you simulate email replies with different status keywords
- Show you the results of status updates

### 4. Test Keywords
Try these reply contents to test different status updates:
- "This task is completed" → status becomes `completed`
- "I am working on this task" → status becomes `in_progress` 
- "I am blocked on this task" → status becomes `blocked`

## API Endpoints Available

### Check tasks with email tracking:
```
GET http://localhost:5000/api/debug/get-tasks-with-emails
```

### Simulate email reply:
```
POST http://localhost:5000/api/test/email-reply
Content-Type: application/json

{
  "taskId": "your-task-uuid",
  "replyContent": "completed",
  "fromEmail": "employee@company.com"
}
```

### Process actual email reply:
```
POST http://localhost:5000/api/email/reply
Content-Type: application/json

{
  "messageId": "reply-123@gmail.com",
  "inReplyTo": "original-message-id",
  "from": "employee@company.com", 
  "subject": "Re: Task Assignment",
  "body": "Task completed!",
  "headers": {
    "message-id": "reply-123@gmail.com",
    "in-reply-to": "original-message-id"
  }
}
```

## Current Status

✅ Database schema updated with email tracking columns
✅ Backend endpoints created for email reply processing  
✅ Test interface available at http://localhost:5000/test/email-reply
✅ Message ID capture implemented in sendBatchEmails function
✅ Status keyword detection working

## Next Steps

1. Upload a meeting to generate tasks with emails
2. Test the reply tracking through the web interface
3. Integrate with real email webhook system for production

The email reply tracking system is now ready for testing!