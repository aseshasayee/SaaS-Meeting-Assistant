require('dotenv').config();

console.log('=== Environment Variables Test ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT SET');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? 'SET' : 'NOT SET');

console.log('\n=== Raw Values (first 20 chars) ===');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL?.substring(0, 20) + '...');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY?.substring(0, 20) + '...');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY?.substring(0, 20) + '...');