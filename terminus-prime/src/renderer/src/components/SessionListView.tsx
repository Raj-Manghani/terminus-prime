import React, { useState, useEffect, useCallback } from 'react';
// Corrected import path for preload types, assuming preload.ts is in src/
// components is src/renderer/src/components -> ../../preload -> src/preload
import type { SessionProfile, SessionProfileCreateData } from '../../../preload';

interface SessionListViewProps {
  appUnlocked: boolean;
  currentConnectionDetails: { host: string; port: string; username: string; password?: string };
  onConnectSession: (session: SessionProfile) => void;
}

const SessionListView: React.FC<SessionListViewProps> = ({ appUnlocked, currentConnectionDetails, onConnectSession }) => {
  const [sessions, setSessions] = useState<SessionProfile[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState('');

  const loadSessions = useCallback(async () => {
    if (!appUnlocked || !window.electronAPI) { // Added check for window.electronAPI
      setSessions([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const loadedSessions = await window.electronAPI.loadSessions();
      setSessions(loadedSessions);
    } catch (err: any) {
      console.error("Error loading sessions:", err);
      setError("Failed to load sessions: " + (err.message || 'Unknown error'));
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, [appUnlocked]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]); // appUnlocked is implicitly handled by loadSessions check

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
  };

  const handleConnectSelected = () => {
    if (selectedSessionId) {
      const sessionToConnect = sessions.find(s => s.id === selectedSessionId);
      if (sessionToConnect) {
        onConnectSession(sessionToConnect);
      }
    }
  };

  const handleSaveCurrentSession = async () => {
    if (!newSessionName.trim()) {
      alert("Please enter a name for the new session.");
      return;
    }
    if (!appUnlocked || !window.electronAPI) {
      alert("App must be unlocked and API available to save sessions.");
      return;
    }
    setError(null);
    try {
      const portNumber = parseInt(currentConnectionDetails.port, 10);
      if (isNaN(portNumber)) {
        alert("Invalid port number.");
        return;
      }
      const profileData: SessionProfileCreateData = {
        name: newSessionName,
        host: currentConnectionDetails.host,
        port: portNumber,
        username: currentConnectionDetails.username,
        authMethod: 'password', // Defaulting, could be more dynamic later
        password: currentConnectionDetails.password || undefined,
        // notes: "", // Initialize if needed
      };
      const newSession = await window.electronAPI.addSession(profileData);
      if (newSession) {
        setSessions(prev => [...prev, newSession].sort((a,b) => a.name.localeCompare(b.name))); // Keep sorted
        setNewSessionName('');
        alert(`Session '${newSession.name}' saved!`);
      } else {
        setError("Failed to save session. Master key might not be set or another error occurred.");
      }
    } catch (err: any) {
      console.error("Error saving current session:", err);
      setError("Failed to save session: " + (err.message || 'Unknown error'));
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!appUnlocked || !window.electronAPI || !confirm("Are you sure you want to delete this session?")) {
      return;
    }
    setError(null);
    try {
      const success = await window.electronAPI.deleteSession(sessionId);
      if (success) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (selectedSessionId === sessionId) {
          setSelectedSessionId(null);
        }
        alert("Session deleted.");
      } else {
        setError("Failed to delete session. It might have already been deleted or an error occurred.");
      }
    } catch (err: any) {
      console.error("Error deleting session:", err);
      setError("Failed to delete session: " + (err.message || 'Unknown error'));
    }
  };

  if (!appUnlocked) {
    return <p style={{ padding: '15px', color: '#aaa', textAlign: 'center', fontSize: '0.9em' }}>Unlock to manage sessions.</p>;
  }
  if (isLoading) {
    return <p style={{ padding: '15px', color: '#ccc', textAlign: 'center' }}>Loading sessions...</p>;
  }
  if (error) {
    return <p style={{ padding: '15px', color: '#ff8b8b', textAlign: 'center' }}>Error: {error} <button onClick={loadSessions}>Retry</button></p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#2a2d35', color: 'white' }}>
      <div style={{padding: '10px', borderBottom: '1px solid #444'}}>
        <h4 style={{margin: '0 0 8px 0'}}>Save Current Connection</h4>
        <input
            type="text"
            placeholder="New Session Name"
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            style={{width: 'calc(100% - 12px)', marginBottom: '8px', padding: '8px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#3a3a3c', color: 'white'}}
        />
        <button onClick={handleSaveCurrentSession} style={{width: '100%', padding: '10px', borderRadius: '4px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer'}}>
            Save Current
        </button>
      </div>

      <h4 style={{padding: '10px 10px 5px 10px', margin: '0'}}>Saved Sessions</h4>
      {sessions.length === 0 && <p style={{padding: '0 10px 10px 10px', color: '#aaa', fontSize: '0.9em' }}>No sessions saved yet.</p>}

      <ul style={{ listStyle: 'none', padding: '0 10px', margin: 0, overflowY: 'auto', flexGrow: 1}}>
        {sessions.map(session => (
          <li key={session.id}
              onClick={() => handleSelectSession(session.id)}
              onDoubleClick={handleConnectSelected} // Allow double click to connect
              title={`Username: ${session.username}\nHost: ${session.host}:${session.port}\nAuth: ${session.authMethod}\nNotes: ${session.notes || 'N/A'}`}
              style={{
                padding: '10px', margin: '4px 0',
                backgroundColor: selectedSessionId === session.id ? '#007bff' : '#3f4247',
                color: selectedSessionId === session.id ? 'white' : '#e0e0e0',
                cursor: 'pointer', borderRadius: '4px', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center', transition: 'background-color 0.2s'
              }}>
            <span style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
              {session.name} <br/>
              <em style={{fontSize: '0.75em', color: selectedSessionId === session.id ? '#eee' : '#999'}}>
                {session.username}@{session.host}:{session.port}
              </em>
            </span>
            <button
                onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id);}}
                style={{background: '#d9534f', color: 'white', border: 'none', borderRadius: '3px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8em', marginLeft: '5px'}}
                title="Delete Session"
            >X</button>
          </li>
        ))}
      </ul>
      {selectedSessionId && sessions.find(s=>s.id === selectedSessionId) && ( // Ensure selected session still exists
        <div style={{ padding: '10px', borderTop: '1px solid #444', marginTop: 'auto' }}>
          <button onClick={handleConnectSelected} style={{width: '100%', padding: '12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1em'}}>
            Connect to "{sessions.find(s=>s.id === selectedSessionId)?.name}"
          </button>
        </div>
      )}
    </div>
  );
};
export default SessionListView;
