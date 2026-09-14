import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './index';
import { applyEnvironmentTitle } from '@/shared/lib/document-title';
import './styles/globals.css';

applyEnvironmentTitle();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
