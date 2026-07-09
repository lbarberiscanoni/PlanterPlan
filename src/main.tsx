import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css';
import App from './app/App.tsx'
import { initAnalytics } from '@/shared/analytics/posthog'

// Privacy-first PostHog: no-op unless VITE_POSTHOG_KEY is configured.
initAnalytics();

createRoot(document.getElementById('root')!).render(
 <StrictMode>
 <App />
 </StrictMode>,
)
