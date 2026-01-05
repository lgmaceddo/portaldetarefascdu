import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cocvtnkchcykhesfsvwr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvY3Z0bmtjaGN5a2hlc2ZzdndyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NjUxNzAsImV4cCI6MjA4MzE0MTE3MH0.Ac3qYp9g8YMfj4i7jv5cTQDHO2tmW_oVfddJTMa24N4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
