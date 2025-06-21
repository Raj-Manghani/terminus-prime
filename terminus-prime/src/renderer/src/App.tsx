import React, { useState, useEffect, useCallback } from 'react';
import TerminalView from './TerminalView';
import MasterPasswordModal from './components/MasterPasswordModal';
import SessionListView from './components/SessionListView'; // Import SessionListView
import './App.css';
import type { SetMasterKeyResult, SessionProfile } from '../../preload'; // Import types

const App: React.FC = () => {
  // States for current ad-hoc connection inputs
  const [currentHost, setCurrentHost] = useState('test.rebex.net');
  const [currentPort, setCurrentPort] = useState('22');
  const [currentUsername, setCurrentUsername] = useState('demo');
  const [currentPassword, setCurrentPassword] = useState('password');

  // Master Password Modal State
  const [isMasterPasswordModalOpen, setIsMasterPasswordModalOpen] = useState(false);
  const [masterPasswordMessage, setMasterPasswordMessage] = useState('');
  const [isSettingNewPassword, setIsSettingNewPassword] = useState(false); // Example: could be true for first run
  const [appUnlocked, setAppUnlocked] = useState(false);
  const [keytarAvailable, setKeytarAvailable] = useState<boolean | null>(null);

  // SSH Connection status (from IPC)
  const [sshStatus, setSshStatus] = useState('');
  const [sshStatusMessage, setSshStatusMessage] = useState('');


  const loadInitialData = useCallback(async () => {
    // This function can be expanded to load other app settings if needed
    if (appUnlocked) {
      console.log("App unlocked, sessions can now be loaded by SessionListView.");
      // SessionListView will call loadSessions internally based on appUnlocked prop
    }
  }, [appUnlocked]);

  const checkMasterKeyAndLockStatus = useCallback(async () => {
    if (!window.electronAPI) {
      console.error("FATAL: ElectronAPI not found on window.");
      setMasterPasswordMessage("Error: Application cannot load critical security components. Please restart or reinstall.");
      setIsMasterPasswordModalOpen(true);
      setAppUnlocked(false);
      return;
    }

    const isKeyAlreadySetInMemory = await window.electronAPI.isMasterKeySet();
    if (isKeyAlreadySetInMemory) {
      setAppUnlocked(true);
      setIsMasterPasswordModalOpen(false);
      console.log("App unlocked: Master key is already set in memory.");
      loadInitialData();
      return;
    }

    setAppUnlocked(false);
    const keytarStatus = await window.electronAPI.checkKeytarStatus();
    const isKeytarFunc = keytarStatus === 'available';
    setKeytarAvailable(isKeytarFunc);

    // This is a simplified way to determine if it's a first-time setup for the password
    // A more robust way would be to check if any sessions exist or a settings flag.
    // For now, if keytar is not functional and no key is in memory, suggest setting a new password.
    setIsSettingNewPassword(!isKeytarFunc);

    if (isKeytarFunc) {
      setMasterPasswordMessage("Enter master password to unlock your saved sessions and settings. If this is the first time after enabling keychain integration, this password will be used to encrypt the key stored in the OS keychain.");
    } else {
      setMasterPasswordMessage("Enter master password. Since OS keychain is not available, this password will encrypt your data each session. If this is the first time, it will become your new master password.");
    }
    setIsMasterPasswordModalOpen(true);
  }, [loadInitialData]);

  useEffect(() => {
    checkMasterKeyAndLockStatus();
  }, [checkMasterKeyAndLockStatus]);

  // Listener for SSH status updates from main process
  useEffect(() => {
    if (window.electronAPI && appUnlocked) { // Only listen if app is unlocked
      const unsub = window.electronAPI.onSshStatus(status => {
        setSshStatus(status.status);
        setSshStatusMessage(status.message);
        if (status.status === 'connected') {
          // console.log("SSH Connected via App.tsx status update");
        } else if (status.status === 'disconnected' || status.status === 'error') {
          // console.log("SSH Disconnected or Errored via App.tsx status update");
        }
      });
      return unsub;
    }
  }, [appUnlocked]);


  const handleMasterPasswordSubmit = async (submittedPassword: string): Promise<SetMasterKeyResult> => {
    const result = await window.electronAPI.setMasterKeyFromPassword(submittedPassword, keytarAvailable ?? false);
    if (result.success) {
      setAppUnlocked(true);
      setIsMasterPasswordModalOpen(false);
      console.log("Master key processed successfully via App.tsx.");
      loadInitialData();
    } else {
      setAppUnlocked(false);
      console.error("Failed to process master password via App.tsx.");
    }
    return result;
  };

  const handleConnectSessionFromList = (session: SessionProfile) => {
    if (!appUnlocked) {
      alert("Please unlock the application first.");
      checkMasterKeyAndLockStatus();
      return;
    }
    console.log('App.tsx: Connecting to session from list:', session.name);
    setCurrentHost(session.host);
    setCurrentPort(session.port.toString());
    setCurrentUsername(session.username);
    setCurrentPassword(session.password || ''); // Use session password or empty

    window.electronAPI.sshConnect({
      host: session.host,
      port: session.port,
      username: session.username,
      password: session.password,
    });
  };

  const handleAdHocConnect = () => {
    if (!appUnlocked) {
      alert("Please unlock the application first.");
      checkMasterKeyAndLockStatus();
      return;
    }
    console.log('App.tsx: Ad-hoc connect with:', { currentHost, port: Number(currentPort), currentUsername });
    window.electronAPI.sshConnect({ host: currentHost, port: Number(currentPort), username: currentUsername, password: currentPassword });
  };

  const handleSshDisconnect = () => {
    window.electronAPI.sshDisconnect();
    setSshStatus('disconnected');
    setSshStatusMessage('Disconnected by user.');
  };

  const handleLockApp = () => {
    window.electronAPI.clearMasterKey();
    setAppUnlocked(false);
    setSshStatus(''); // Clear SSH status on lock
    setSshStatusMessage('');
    // checkMasterKeyAndLockStatus(); // This will re-trigger the modal
    setIsMasterPasswordModalOpen(true);
    setMasterPasswordMessage("Application locked. Enter master password to unlock.");
  };

  return (
    <div className="App">
      <MasterPasswordModal
        isOpen={isMasterPasswordModalOpen}
        onPasswordSubmit={handleMasterPasswordSubmit}
        message={masterPasswordMessage}
        isSettingNewPassword={isSettingNewPassword}
      />

      <header className="App-header">
        <div className="App-header-top">
          <h1>Terminus Prime</h1>
          <div className="App-header-status">
            {appUnlocked && sshStatus && (
                <span title={sshStatusMessage}>SSH: {sshStatus}</span>
            )}
            {appUnlocked && <button onClick={handleLockApp} title="Lock App & Clear Master Key">Lock App</button>}
          </div>
        </div>
        {appUnlocked && ( // Only show connection bar if unlocked
          <div className="App-header-controls">
            <input type="text" value={currentHost} onChange={(e) => setCurrentHost(e.target.value)} placeholder="Host" />
            <input type="number" value={currentPort} onChange={(e) => setCurrentPort(e.target.value)} placeholder="Port" />
            <input type="text" value={currentUsername} onChange={(e) => setCurrentUsername(e.target.value)} placeholder="Username" />
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Password" />
            <button onClick={handleAdHocConnect}>Connect</button>
            <button onClick={handleSshDisconnect} disabled={!sshStatus || sshStatus === 'disconnected'}>Disconnect SSH</button>
          </div>
        )}
        {!appUnlocked && (
          <p className="App-locked-message">Application is locked. Please provide the master password.</p>
        )}
      </header>

      <div className="App-body">
        <aside className="App-sidebar">
          <SessionListView
            appUnlocked={appUnlocked}
            currentConnectionDetails={{ host: currentHost, port: currentPort, username: currentUsername, password: currentPassword }}
            onConnectSession={handleConnectSessionFromList}
          />
        </aside>
        <main className="App-content">
          {appUnlocked ? <TerminalView /> : <div className="App-content-locked"><p>Unlock to use terminal.</p></div>}
        </main>
      </div>
    </div>
  );
}

export default App;
