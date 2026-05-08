// Middleware intentionally disabled. Auth checks happen server-side in
// `app/(app)/layout.tsx` and `app/page.tsx` instead, which avoids Edge/Node
// runtime compatibility issues with @supabase/ssr on Vercel.
//
// To re-enable: replace this file with the previous magic-link gating logic.

export const config = {
  matcher: [],
};
