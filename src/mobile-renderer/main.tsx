import React from 'react';
import ReactDOM from 'react-dom/client';

// MobileApp and installBridge will be created in later tasks.
// For T1 we just render a placeholder so the Vite build pipeline has something to compile.
function Placeholder() {
  return (
    <div style={{ padding: 24, color: '#f5f5f5', fontFamily: 'sans-serif' }}>
      <h1 style={{ margin: 0, fontSize: 18 }}>The Office Mobile</h1>
      <p style={{ fontSize: 12, color: '#999' }}>
        Scaffold is live. Components arrive in subsequent tasks.
      </p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Placeholder />
  </React.StrictMode>,
);
