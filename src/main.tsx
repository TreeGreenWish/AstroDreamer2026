import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import DreamAiRetryControls from './components/DreamAiRetryControls';
import { ExportJournalButton } from './components/ExportJournalButton';
import { AuthGate } from './components/AuthGate';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
      <DreamAiRetryControls />
      <ExportJournalButton />
    </AuthGate>
  </StrictMode>,
);
