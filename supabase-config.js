// VistaTour — Supabase client config
// Publishable key es segura en frontend (RLS protege los datos).
// NUNCA committear la service_role key ni el DB password.

export const SUPABASE_URL = 'https://megutxequzmbzdildhlk.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_RhFmrFWdH_XfxdTmqs-NLg_UcFVVZp1';
export const SUPABASE_STORAGE_BUCKET = 'tour-images';

// Uso desde HTML:
//   <script type="module">
//     import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
//     import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';
//     const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
//     window.supabase = supabase;
//   </script>
