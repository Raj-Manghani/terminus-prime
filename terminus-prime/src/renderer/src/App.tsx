import React, { useState, useEffect } from 'react';
import TerminalView from './TerminalView';
import './App.css';
import type { SshStatus } from '../../preload';

const App: React.FC = () => {
  const [host, setHost] = useState('test.rebex.net');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('demo');
  const [password, setPassword] = useState('password');
  const [connectionStatus, setConnectionStatus] = useState<SshStatus['status']>('disconnected');
  const [statusMessage, setStatusMessage] = useState('Enter credentials and connect.');

  useEffect(() => {
    if (!window.electronAPI) {
      console.error("Electron API not found on window. Preload script might not have loaded correctly.");
      setStatusMessage("Error: Preload script failed. IPC unavailable.");
      return;
    }
    const unsub = window.electronAPI.onSshStatus((status) => {
      setConnectionStatus(status.status);
      setStatusMessage(status.message);
    });
    return unsub;
  }, []);

  const handleConnect = () => {
    if (!window.electronAPI) return;
    if (connectionStatus === 'connected' || connectionStatus === 'connecting') return;
    console.log('Attempting to connect with:', { host, port: Number(port), username });
    setConnectionStatus('connecting');
    setStatusMessage('Attempting to connect...');
    window.electronAPI.sshConnect({ host, port: Number(port), username, password });
  };

  const handleDisconnect = () => {
    if (!window.electronAPI) return;
    if (connectionStatus === 'disconnected' || connectionStatus === 'connecting' && connectionStatus !== 'connected' ) return; // Allow disconnect if connecting fails or stuck
    console.log('Attempting to disconnect...');
    window.electronAPI.sshDisconnect();
  };

  return (
    <div className="App" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <header className="App-header" style={{ backgroundColor: '#282c34', padding: '10px', color: 'white', flexShrink: 0 }}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
            <h1 style={{ margin: 0, fontSize: '1.3em' }}>Terminus Prime</h1>
            <span style={{fontSize: '0.9em', textAlign: 'right', minWidth: '150px'}}>
                Status: {connectionStatus} <br/>
                {(connectionStatus !== 'disconnected' || statusMessage !== 'Enter credentials and connect.') && statusMessage}
            </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          <input type="text" value={host} onChange={(e) => setHost(e.target.value)} placeholder="Host" disabled={connectionStatus === 'connected' || connectionStatus === 'connecting'} />
          <input type="number" value={port} onChange={(e) => setPort(e.target.value)} placeholder="Port" style={{width: "55px"}} disabled={connectionStatus === 'connected' || connectionStatus === 'connecting'} />
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" disabled={connectionStatus === 'connected' || connectionStatus === 'connecting'} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" disabled={connectionStatus === 'connected' || connectionStatus === 'connecting'} />
          <button onClick={handleConnect} disabled={connectionStatus === 'connected' || connectionStatus === 'connecting'}>Connect</button>
          <button onClick={handleDisconnect} disabled={connectionStatus === 'disconnected' && statusMessage === 'Enter credentials and connect.'}>Disconnect</button>
        </div>
      </header>
      <main style={{ flexGrow: 1, backgroundColor: '#1e1e1e', overflow: 'hidden' }}>
        <TerminalView />
      </main>
    </div>
  );
}
export default App;
