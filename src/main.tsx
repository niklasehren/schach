import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/instrument-sans';
import '@fontsource/instrument-serif';
import './index.css';
import { App } from './app/App';
import { applyTheme } from './app/theme';
import { startAccountIfSignedIn } from './sync/state';

// Darstellung vor dem ersten Zeichnen setzen (kein Aufblitzen)
applyTheme();
// Mit Konto: Supabase nachladen und im Hintergrund synchronisieren (ohne Konto bleibt alles lokal)
startAccountIfSignedIn();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
