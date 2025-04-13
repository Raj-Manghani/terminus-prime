import React from 'react';
import TerminalView from './components/TerminalView';
import './app.css'; // Import a CSS file for basic styling

function App() {
  return (
    <div className="app-container">
      {/* We can add header/tabs/sidebar placeholders later */}
      <div className="terminal-container">
        <TerminalView />
      </div>
    </div>
  );
}

export default App;
