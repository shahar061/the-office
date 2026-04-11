import React from 'react';
import ReactDOM from 'react-dom/client';
import { MobileApp } from './MobileApp';
import { installBridge } from './bridge';

installBridge();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MobileApp />
  </React.StrictMode>,
);
