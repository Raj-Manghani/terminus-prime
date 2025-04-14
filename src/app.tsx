import React, { useState } from 'react';
import TerminalView from './components/TerminalView';
import SessionManager, { SessionProfile } from './components/SessionManager';
import './app.css';

function App() {
  console.log('App: rendering');
  const [selectedSession, setSelectedSession] = useState<SessionProfile | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [pendingSession, setPendingSession] = useState<SessionProfile | null>(null);
  const [password, setPassword] = useState('');

  // Handler for when a session is selected in the sidebar
  const handleConnect = (session: SessionProfile) => {
    console.log('App: handleConnect called with', session);
    setPendingSession(session);
    setShowPasswordPrompt(true);
  };

  // Handler for submitting the password prompt
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingSession) {
      console.log('App: handlePasswordSubmit for', pendingSession, 'with password', password);
      setSelectedSession({ ...pendingSession, password }); // Pass password to TerminalView via props
      setShowPasswordPrompt(false);
      setPassword('');
      setPendingSession(null);
    }
  };

  // Handler for canceling the password prompt
  const handlePasswordCancel = () => {
    setShowPasswordPrompt(false);
    setPassword('');
    setPendingSession(null);
  };

  return (
    <div className="app-container" style={{ position: 'relative' }}>
      <div className="session-sidebar">
        <SessionManager onConnect={handleConnect} />
      </div>
      {/* Password prompt modal OUTSIDE terminal container */}
      {showPasswordPrompt && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(30,30,30,0.85)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
            // border: '4px solid red' // Remove debug border
          }}
        >
          {/* DEBUG: Password prompt modal is rendering */}
          <form
            onSubmit={handlePasswordSubmit}
            style={{
              background: '#23272e',
              padding: '2rem',
              borderRadius: 8,
              boxShadow: '0 2px 12px #000a',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              minWidth: 320
            }}
          >
            <h3 style={{ margin: 0, color: '#fff' }}>
              Enter password for {pendingSession?.username}@{pendingSession?.host}
            </h3>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              style={{
                padding: '0.5rem',
                borderRadius: 4,
                border: '1px solid #444',
                fontSize: '1rem'
              }}
              placeholder="Password"
            />
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handlePasswordCancel}
                style={{
                  background: '#444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '0.5rem 1rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  background: '#0078d4',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '0.5rem 1rem',
                  cursor: 'pointer'
                }}
                disabled={!password}
              >
                Connect
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="terminal-container" style={{ flex: 1 }}>
        {/* Remove key prop to test remount behavior */}
        <TerminalView session={selectedSession} />
      </div>
    </div>
  );
}

export default App;
