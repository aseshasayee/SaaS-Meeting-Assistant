-- Add email tracking columns to tasks table
-- This enables email reply tracking for task status updates

-- Add columns for email message tracking
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS email_message_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_reply_message_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_reply_content TEXT;

-- Add index for faster lookup by message ID
CREATE INDEX IF NOT EXISTS idx_tasks_email_message_id ON tasks(email_message_id);

-- Add comments for documentation
COMMENT ON COLUMN tasks.email_message_id IS 'Message-ID from sent email (for tracking replies)';
COMMENT ON COLUMN tasks.email_sent_at IS 'Timestamp when task email was sent';
COMMENT ON COLUMN tasks.last_reply_at IS 'Timestamp of last email reply received';
COMMENT ON COLUMN tasks.last_reply_message_id IS 'Message-ID of last reply email';
COMMENT ON COLUMN tasks.last_reply_content IS 'Content of last email reply';

-- Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'tasks' 
  AND column_name IN ('email_message_id', 'email_sent_at', 'last_reply_at', 'last_reply_message_id', 'last_reply_content')
ORDER BY column_name;