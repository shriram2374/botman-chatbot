import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Validate if URL string is a valid HTTP/HTTPS schema
const isValidUrl = (urlStr) => {
  if (!urlStr) return false;
  try {
    const url = new URL(urlStr);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
};

const finalUrl = isValidUrl(supabaseUrl) 
  ? supabaseUrl 
  : "https://placeholder-project.supabase.co"; // Sane syntactic fallback for pre-rendering build checks

const finalKey = (supabaseAnonKey && supabaseAnonKey !== 'your_supabase_anon_key_here')
  ? supabaseAnonKey 
  : "placeholder-anon-key";

if (!isValidUrl(supabaseUrl) || finalKey === "placeholder-anon-key") {
  console.warn("Supabase credentials are unconfigured or invalid inside env variables.");
}

export const supabase = createClient(finalUrl, finalKey);
