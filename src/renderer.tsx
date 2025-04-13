import React from 'react';
import ReactDOM from 'react-dom/client'; // Use client API for React 18+
import App from './app';

// Ensure the root element exists
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error("Root element 'root' not found in index.html");
}

console.log('👋 This message is being logged by "renderer.tsx", included via the renderer process.');
