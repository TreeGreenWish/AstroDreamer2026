import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import DreamAiRetryControls from './components/DreamAiRetryControls';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <DreamAiRetryControls />
  </StrictMode>,
);
