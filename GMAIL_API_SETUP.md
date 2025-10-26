# Gmail API Setup Guide for Production Email Reply Tracking

This guide will help you set up Gmail API for automatic email reply processing in production.

## Prerequisites

1. **Google Cloud Project**: You need a Google Cloud project with Gmail API enabled
2. **Domain Verification**: For production, you'll need a verified domain
3. **OAuth Consent Screen**: Configured for your application

## Step 1: Enable Gmail API in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services > Library**
4. Search for "Gmail API" and enable it
5. Navigate to **APIs & Services > Credentials**

## Step 2: Create OAuth 2.0 Credentials

1. Click **Create Credentials > OAuth 2.0 Client IDs**
2. Choose **Web application**
3. Add authorized redirect URIs:
   - `http://localhost:5000/auth/gmail/callback` (for local testing)
   - `https://yourdomain.com/auth/gmail/callback` (for production)
4. Save the **Client ID** and **Client Secret**

## Step 3: Set up Google Pub/Sub Topic (for webhook notifications)

1. Go to **Pub/Sub > Topics** in Google Cloud Console
2. Create a new topic: `gmail-notifications`
3. Note the full topic name: `projects/your-project-id/topics/gmail-notifications`
4. Create a subscription to this topic if needed

## Step 4: Update Environment Variables

Add these to your `.env` file:

```env
# Gmail API Configuration
GMAIL_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_REFRESH_TOKEN=will_be_generated_in_next_step
GMAIL_REDIRECT_URI=http://localhost:5000/auth/gmail/callback

# Webhook Configuration  
GMAIL_TOPIC_NAME=projects/your-project-id/topics/gmail-notifications
```

## Step 5: Authorize Gmail Access

1. **Start your server**: `docker-compose up backend -d`

2. **Get authorization URL**:
   ```bash
   curl http://localhost:5000/api/gmail/auth
   ```

3. **Visit the authorization URL** in your browser

4. **Grant permissions** to your application

5. **Get the refresh token** from the callback response

6. **Update your .env file** with the refresh token

## Step 6: Set Up Gmail Webhook

Once authorized, set up the webhook for real-time notifications:

```bash
curl -X POST http://localhost:5000/api/gmail/setup-webhook
```

## Step 7: Test the Integration

1. **Send a task email** through your application
2. **Reply to the email** from the recipient's Gmail account
3. **Check the logs** to see if the reply was processed
4. **Verify task status** was updated in your database

## API Endpoints

### Setup Endpoints

- `GET /api/gmail/auth` - Get Gmail authorization URL
- `GET /auth/gmail/callback` - OAuth callback endpoint  
- `POST /api/gmail/setup-webhook` - Set up email notifications
- `POST /api/gmail/stop-webhook` - Stop email notifications

### Processing Endpoints

- `POST /api/gmail/webhook` - Receive email notifications from Google
- `POST /api/gmail/check-emails` - Manual email check (backup)

## Production Deployment

### Security Considerations

1. **Use HTTPS**: Gmail API requires HTTPS for production
2. **Verify Webhook**: Implement proper webhook verification
3. **Rate Limiting**: Implement rate limiting on webhook endpoints
4. **Error Handling**: Add comprehensive error handling and logging

### Domain Setup

1. **Register your domain** in Google Cloud Console
2. **Verify domain ownership**
3. **Update OAuth consent screen** with your domain
4. **Update redirect URIs** to use your production domain

### Environment Variables for Production

```env
GMAIL_REDIRECT_URI=https://yourdomain.com/auth/gmail/callback
GMAIL_WEBHOOK_ENDPOINT=https://yourdomain.com/api/gmail/webhook
```

## Troubleshooting

### Common Issues

1. **"Redirect URI mismatch"**: Ensure redirect URI in Google Cloud matches your .env file
2. **"Invalid grant"**: Refresh token may have expired, re-authorize
3. **"Insufficient permissions"**: Ensure Gmail API is enabled and OAuth scopes are correct
4. **"Webhook not receiving notifications"**: Check Pub/Sub topic configuration

### Debug Endpoints

- `GET /api/debug/get-tasks-with-emails` - Check tasks with email tracking
- `POST /api/test/email-reply` - Simulate email reply for testing

## Monitoring

### Key Metrics to Track

1. **Email delivery rate**: Track successful email sends
2. **Reply processing time**: Monitor webhook response times  
3. **Task status accuracy**: Verify status updates are correct
4. **Error rates**: Monitor failed webhook deliveries

### Logging

All email processing activities are logged with prefixes:
- `📧` Email processing
- `🔔` Webhook notifications
- `✅` Successful operations
- `❌` Error conditions

## Alternative: IMAP Polling (Backup Method)

If webhooks fail, you can implement IMAP polling as a backup:

```javascript
// Add to your cron jobs or scheduled tasks
setInterval(async () => {
  try {
    await gmailService.checkForNewEmails();
  } catch (error) {
    console.error('IMAP polling error:', error);
  }
}, 30000); // Check every 30 seconds
```

## Support

For issues with this integration:
1. Check the server logs for detailed error messages
2. Verify Google Cloud API quotas and limits
3. Test with the simulation endpoints first
4. Review Gmail API documentation: https://developers.google.com/gmail/api