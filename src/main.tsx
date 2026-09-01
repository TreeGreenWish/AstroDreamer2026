import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './lib/localDateOnly';
import App from './App.tsx';
import DreamAiRetryControls from './components/DreamAiRetryControls';
import { AuthGate } from './components/AuthGateV2';
import UnknownDreamTimeSupport from './components/UnknownDreamTimeSupport';
import { ProfileAccountControls } from './components/ProfileAccountControls';
import CreativeJournalPortal from './components/CreativeJournalPortal';
import CreativeNavBridge from './components/CreativeNavBridge';
import ProfileAstrologyGuide from './components/ProfileAstrologyGuide';
import OwnerFeedbackNotifier from './components/OwnerFeedbackNotifier';
import BrandNameNormalizer from './components/BrandNameNormalizer';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandNameNormalizer />
    <AuthGate>
      <App />
      <UnknownDreamTimeSupport />
      <ProfileAccountControls />
      <DreamAiRetryControls />
      <CreativeJournalPortal />
      <CreativeNavBridge />
      <ProfileAstrologyGuide />
      <OwnerFeedbackNotifier />
    </AuthGate>
  </StrictMode>,
);
