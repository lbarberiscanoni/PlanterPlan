/// <reference types="vite/client" />

interface ImportMetaEnv {
 readonly VITE_SUPABASE_URL: string
 readonly VITE_SUPABASE_ANON_KEY: string
 // PostHog analytics (privacy-first, custom events only). Optional — analytics
 // no-ops when the key is absent. Host defaults to US cloud.
 readonly VITE_POSTHOG_KEY?: string
 readonly VITE_POSTHOG_HOST?: string
}

interface ImportMeta {
 readonly env: ImportMetaEnv
}
