import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { initSecureAgentBridgeTransport } from './utils/secureAgentBridge';

initSecureAgentBridgeTransport();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
