require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  console.error('Please make sure SUPABASE_URL and SUPABASE_ANON_KEY are set in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test connection
const testConnection = async () => {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .limit(1);
    
    if (error) {
      console.log('Database connection test failed:', error.message);
      console.log('Make sure your Supabase URL and key are correct in .env file');
    } else {
      console.log('✅ Database connection successful');
    }
  } catch (err) {
    console.log('Database connection error:', err.message);
  }
};

// Test connection on startup
testConnection();

module.exports = {
  supabase
};