import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './lib/localDateOnly';
import App from './App.tsx';
import DreamAiRetryControls from './components/DreamAiRetryControls';
import { ExportJournalButton } from './components/ExportJournalButton';
import { AuthGate } from './components/AuthGate';
import UnknownDreamTimeSupport from './components/UnknownDreamTimeSupport';
import { ProfileAccountControls } from './components/ProfileAccountControls';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
      <UnknownDreamTimeSupport />
      <ProfileAccountControls />
      <DreamAiRetryControls />
      <ExportJournalButton />
    </AuthGate>
  </StrictMode>,
);
