import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App, { Boundary } from './App';
import { startUploadQueue } from './services/uploadQueue';
import './styles.css';

void startUploadQueue();

window.addEventListener('unhandledrejection', (event) => {
  console.error('Nespracovaná chyba', event.reason);
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Boundary>
      <HashRouter>
        <App />
      </HashRouter>
    </Boundary>
  </React.StrictMode>,
);
