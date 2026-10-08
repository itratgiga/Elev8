import { createClient } from '@supabase/supabase-js'

// The anon key is public by design. Row Level Security keeps each shop's data private.
// Never put a service_role key, Meta token or Gemini key in this app.
export const SUPABASE_URL =
  import.meta.env?.VITE_SUPABASE_URL || 'https://juaowhvaptywgrqvhbbi.supabase.co'

export const SUPABASE_ANON_KEY =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1YW93aHZhcHR5d2dycXZoYmJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMTUyODUsImV4cCI6MjEwNjc5MTI4NX0.U8rFPZZM8sItQjGNa14pGdNpQY0k1zT7oXH5_OTbA_k'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const publicUrl = (bucket, path) =>
  path ? `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}` : null
