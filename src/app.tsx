import React, { useState, useEffect } from 'react';
import TerminalView from './components/TerminalView'; // Keep import for Tab component
import SessionManager, { SessionProfile } from './components/SessionManager';
import MasterPasswordPrompt from './components/MasterPasswordPrompt';
import TabBar from './components/TabBar';
import Tab from './components/Tab';
import './app.css';
const { ipcRenderer } = require('electron');
import { v4 as uuidv4 } from 'uuid';

// Define the structure of a tab
interface AppTab {
  id: string;
  title: string;
  session: SessionProfile | null; // Session associated with this tab
  // Add other tab-specific state here (e.g., split panes layout)
}

function App() {
  console.log('App: rendering');
  const [isLocked, setIsLocked] = useState(true);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  // const [selectedSession, setSelectedSession] = useState<SessionProfile | null>(null); // Remove selectedSession state
  const [tabs, setTabs] = useState<AppTab[]>([]); // List of open tabs
  const [activeTabId, setActiveTabId] = useState<string | null>(null); // ID of the active tab
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [pendingSession, setPendingSession] = useState<SessionProfile | null>(null);
  const [password, setPassword] = useState('');
  // const [isConnected, setIsConnected] = useState(false); // Remove App's connection state
  // const [reconnectTrigger, setReconnectTrigger] = useState(0); // Remove reconnect trigger

  // Handler for unlocking the app via master password (remains the same)
  const handleUnlock = async (masterPassword: string): Promise<boolean> => {
    console.log('App: Attempting unlock...');
    setUnlockError(null);
    try {
      const success: boolean = await ipcRenderer.invoke('app:unlock', masterPassword);
      if (success) {
        console.log('App: Unlock successful');
        setIsLocked(false); // Show main UI
        // Create an initial tab when unlocked
        handleNewTabClick();
        return true;
      } else {
        console.log('App: Unlock failed (main process)');
        setUnlockError('Incorrect password or initialization failed.');
        return false;
      }
    } catch (err) {
      console.error('App: Error during unlock IPC:', err);
      setUnlockError('An error occurred during unlock.');
      return false;
    }
  };

  // Handler for connecting to a session (now opens/switches tabs, reuses empty active tab)
  const handleConnect = (session: SessionProfile) => {
    console.log('App: handleConnect called with', session);

    // Check if a tab for this session already exists
    const existingTab = tabs.find(tab => tab.session?.id === session.id);

    if (existingTab) {
      console.log(`App: Session ${session.name} already open in tab ${existingTab.id}. Switching to tab.`);
      setActiveTabId(existingTab.id);
      // Close password prompt if it was open (though unlikely here)
      setShowPasswordPrompt(false);
      setPassword('');
      setPendingSession(null);
    } else {
      // No existing tab for this session, prompt for password
      // We will decide whether to reuse the active tab or create a new one in handlePasswordSubmit
      console.log(`App: No existing tab for session ${session.name}. Prompting for password.`);
      setPendingSession(session);
      setShowPasswordPrompt(true);
    }
  };

  // Handler for submitting the session password prompt
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingSession) return;

    console.log('App: handlePasswordSubmit for', pendingSession, 'with password', password);

    const activeTab = tabs.find(tab => tab.id === activeTabId);
    const canReuseActiveTab = activeTab && activeTab.session === null;

    if (canReuseActiveTab) {
      // Reuse the active empty tab
      console.log(`App: Reusing active empty tab ${activeTabId} for session ${pendingSession.name}`);
      setTabs(prevTabs =>
        prevTabs.map(tab =>
          tab.id === activeTabId
            ? {
                ...tab,
                title: pendingSession.name || pendingSession.host || 'Session',
                session: { ...pendingSession, password }, // Assign session + password
              }
            : tab
        )
      );
      // Active tab ID remains the same
    } else {
      // Create a new tab
      console.log(`App: Creating new tab for session ${pendingSession.name}`);
      const newTabId = uuidv4();
      const newTab: AppTab = {
        id: newTabId,
        title: pendingSession.name || pendingSession.host || 'Session',
        session: { ...pendingSession, password },
      };
      setTabs(prevTabs => [...prevTabs, newTab]);
      setActiveTabId(newTabId); // Make the new tab active
    }

    // Reset prompt state
    setShowPasswordPrompt(false);
    setPassword('');
    setPendingSession(null);
  };

  // Handler for canceling the session password prompt (remains the same)
  const handlePasswordCancel = () => {
    setShowPasswordPrompt(false);
    setPassword('');
    setPendingSession(null);
  };

  // Handler for clicking a tab
  const handleTabClick = (tabId: string) => {
    console.log('App: Tab clicked:', tabId);
    setActiveTabId(tabId);
    // No need to set selectedSession here anymore
  };

  // Handler for closing a tab
  const handleTabClose = (tabId: string) => {
    console.log('App: Closing tab:', tabId);

    // Send disconnect signal *before* removing the tab from state
    console.log(`App: Sending disconnect for tab ID ${tabId}`);
    ipcRenderer.send('terminal-disconnect', tabId);

    setTabs(prevTabs => {
      const updatedTabs = prevTabs.filter(tab => tab.id !== tabId);

      if (updatedTabs.length === 0) {
        // If last tab was closed, create a new empty placeholder tab
        console.log("App: Last tab closed, creating placeholder tab.");
        const newPlaceholderTabId = uuidv4();
        const placeholderTab: AppTab = {
          id: newPlaceholderTabId,
          title: 'New Tab',
          session: null,
        };
        setActiveTabId(newPlaceholderTabId); // Activate the placeholder
        return [placeholderTab]; // Return array with only the placeholder
      } else {
        // If the closed tab was active, activate the next or previous tab
        if (activeTabId === tabId) {
          const closedTabIndex = prevTabs.findIndex(tab => tab.id === tabId);
          // Find the best candidate to activate (prefer right, then left)
          const newActiveTab = updatedTabs[closedTabIndex] || updatedTabs[closedTabIndex - 1];
          setActiveTabId(newActiveTab.id); // Activate the chosen tab
        }
        return updatedTabs; // Return the remaining tabs
      }
    });
  };

  // Handler for clicking the "New Tab" button
  const handleNewTabClick = () => {
    console.log("App: New Tab button clicked.");
    const newTabId = uuidv4();
    const newTab: AppTab = {
      id: newTabId,
      title: 'New Tab',
      session: null, // New tabs start without a session
    };
    setTabs(prevTabs => [...prevTabs, newTab]);
    setActiveTabId(newTabId); // Make the new tab active
    // No need to set selectedSession here anymore
  };

  // Effect to listen for connection status changes from TerminalView (No longer needed in App)
  // useEffect(() => {
  //   const handleStatusUpdate = (event: any, { status }: { status: string }) => {
  //     console.log(`App: Received terminal-status: ${status}`);
  //     setIsConnected(status === 'connected');
  //   };
  //   ipcRenderer.on('terminal-status', handleStatusUpdate);
  //   return () => {
  //     ipcRenderer.removeListener('terminal-status', handleStatusUpdate);
  //   };
  // }, []);


  // Effect to update selectedSession when activeTabId changes (No longer needed)
  // useEffect(() => {
  //     const activeTab = tabs.find(tab => tab.id === activeTabId);
  //     setSelectedSession(activeTab?.session || null);
  // }, [activeTabId, tabs]);


  // Render Master Password Prompt if locked
  if (isLocked) {
    return <MasterPasswordPrompt onUnlock={handleUnlock} initialError={unlockError} />;
  }

  // Render main UI if unlocked
  return (
    <div className="app-container" style={{ position: 'relative' }}>
      <div className="session-sidebar">
        {/* SessionManager no longer needs isTerminalConnected or currentSession */}
        <SessionManager onConnect={handleConnect} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}> {/* Container for TabBar and active Tab */}
        <TabBar
          tabs={tabs.map(tab => ({ id: tab.id, title: tab.title }))} // Pass simplified tab info to TabBar
          activeTabId={activeTabId}
          onTabClick={handleTabClick}
          onTabClose={handleTabClose}
          onNewTabClick={handleNewTabClick}
        />
        <div style={{ flex: 1, position: 'relative' }}> {/* Container for active Tab content */}
          {/* Render all tabs, but only the active one is displayed via CSS */}
          {tabs.map(tab => (
            <Tab
              key={tab.id}
              id={tab.id}
              session={tab.session} // Pass the tab's session data
              isActive={tab.id === activeTabId}
              onClose={handleTabClose} // Pass close handler down
              // isTerminalConnected and reconnectTrigger are now managed internally by TerminalView
            />
          ))}
        </div>
      </div>

      {/* Session Password prompt modal */}
      {showPasswordPrompt && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(30,30,0.85)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <form
            onSubmit={handlePasswordSubmit}
            style={{
              background: '#23272e', padding: '2rem', borderRadius: 8,
              boxShadow: '0 2px 12px #000a', display: 'flex',
              flexDirection: 'column', gap: '1rem', minWidth: 320
            }}
          >
            <h3 style={{ margin: 0, color: '#fff' }}>
              Enter password for {pendingSession?.username}@{pendingSession?.host}
            </h3>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoFocus style={{
                padding: '0.5rem', borderRadius: 4, border: '1px solid #444',
                fontSize: '1rem'
              }}
              placeholder="Password"
            />
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={handlePasswordCancel} style={{
                  background: '#444', color: '#fff', border: 'none',
                  borderRadius: 4, padding: '0.5rem 1rem', cursor: 'pointer'
                }}>
                Cancel
              </button>
              <button type="submit" style={{
                  background: '#0078d4', color: '#fff', border: 'none',
                  borderRadius: 4, padding: '0.5rem 1rem', cursor: 'pointer'
                }} disabled={!password}>
                Connect
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
