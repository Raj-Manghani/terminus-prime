import React, { useState, useEffect, useCallback } from 'react';
// Assuming types are correctly imported from preload or defined in App.tsx and passed
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
    if (!appUnlocked || !window.electronAPI) {
      setSessions([]);
      return;
    }
    setIsLoading(true); setError(null);
    try {
      const loadedSessions = await window.electronAPI.loadSessions();
      loadedSessions.sort((a, b) => a.name.localeCompare(b.name));
      setSessions(loadedSessions);
    } catch (err: any) {
      console.error("Error loading sessions:", err);
      setError("Error loading sessions: " + (err.message || 'Unknown error'));
      setSessions([]);
    }
    finally { setIsLoading(false); }
  }, [appUnlocked]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleSelectSession = (sessionId: string) => setSelectedSessionId(sessionId);

  const handleDoubleClickSession = (session: SessionProfile) => {
    setSelectedSessionId(session.id);
    onConnectSession(session);
  };

  const handleSaveCurrentSession = async () => {
    if (!newSessionName.trim()) { alert("Please enter a name for the new session."); return; }
    if (!appUnlocked || !window.electronAPI) { alert("App must be unlocked to save sessions."); return; }
    setError(null);
    try {
        const portNumber = parseInt(currentConnectionDetails.port, 10);
        if (isNaN(portNumber)) {
            setError("Invalid port number.");
            return;
        }
        const profileData: SessionProfileCreateData = {
            name: newSessionName,
            host: currentConnectionDetails.host,
            port: portNumber,
            username: currentConnectionDetails.username,
            authMethod: 'password', // Defaulting for now
            password: currentConnectionDetails.password || undefined,
            notes: "" // Initialize notes if part of the model
        };
        const newSession = await window.electronAPI.addSession(profileData);
        if (newSession) {
            setSessions(prev => [...prev, newSession].sort((a,b) => a.name.localeCompare(b.name)));
            setNewSessionName('');
        } else { setError("Failed to save session (IPC returned null)."); }
    } catch (err: any) {
        console.error("Error saving current session:", err);
        setError("Failed to save session: " + (err.message || 'Unknown error'));
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!appUnlocked || !window.electronAPI || !confirm("Are you sure you want to delete this session?")) return;
    setError(null);
    try {
        const success = await window.electronAPI.deleteSession(sessionId);
        if (success) {
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            if (selectedSessionId === sessionId) setSelectedSessionId(null);
        } else { setError("Failed to delete session (IPC returned false)."); }
    } catch (err: any) {
        console.error("Error deleting session:", err);
        setError("Failed to delete session: " + (err.message || 'Unknown error'));
    }
  };

  if (!appUnlocked && !isLoading) {
    return <p style={{ padding: '20px', color: '#aaa', textAlign: 'center', fontSize: '0.9em' }}>Unlock to manage sessions.</p>;
  }
  if (isLoading) { return <p style={{ padding: '20px', color: '#ccc', textAlign: 'center' }}>Loading sessions...</p>; }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: '#2a2d35' }}>
      {/* Save Current Session Section */}
      <div style={{ padding: '10px 10px 12px 10px', borderBottom: '1px solid #444', flexShrink: 0 }}>
        <h4 style={{ marginTop: 0, marginBottom: '8px', fontSize: '0.9em', color: '#eee' }}>Save Current Connection</h4>
        <input
            type="text"
            placeholder="New Session Name"
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            style={{width: '100%', marginBottom: '8px', padding: '8px', boxSizing: 'border-box', background: '#3a3a3c', border: '1px solid #555', color: 'white', borderRadius: '3px'}}
        />
        <button
            onClick={handleSaveCurrentSession}
            style={{width: '100%', padding: '8px', boxSizing: 'border-box', background: '#007bff', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.9em'}}
        >
            Save Current
        </button>
        {error && <p style={{color: '#ff8b8b', fontSize: '0.8em', marginTop: '8px', marginBottom: 0, textAlign:'center'}}>{error}</p>}
      </div>

      {/* Saved Sessions List Section */}
      <ul style={{
        listStyle: 'none',
        padding: sessions.length > 0 ? '5px 10px' : '0', // No padding if empty message shown
        margin: 0,
        overflowY: 'auto',
        flexGrow: sessions.length > 0 ? 1 : 0,
        minHeight: sessions.length === 0 ? '0px' : '50px', // No min-height if "no sessions" message takes space
      }}>
        {sessions.map(session => (
          <li key={session.id}
              onClick={() => handleSelectSession(session.id)}
              onDoubleClick={() => handleDoubleClickSession(session)}
              title={`Host: ${session.host}:${session.port}\nUser: ${session.username}\nAuth: ${session.authMethod}${session.notes ? '\nNotes: ' + session.notes : ''}`}
              style={{
                padding: '8px 10px', margin: '4px 0',
                backgroundColor: selectedSessionId === session.id ? '#007bff' : 'transparent',
                color: selectedSessionId === session.id ? 'white' : '#e0e0e0',
                cursor: 'pointer', borderRadius: '4px', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
                border: selectedSessionId === session.id ? '1px solid #0056b3' : '1px solid transparent',
              }}
              onMouseEnter={(e) => { if(selectedSessionId !== session.id) e.currentTarget.style.backgroundColor = '#3a3f47';}}
              onMouseLeave={(e) => { if(selectedSessionId !== session.id) e.currentTarget.style.backgroundColor = 'transparent';}}
          >
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9em' }}>
              {session.name}
            </span>
            <button
                onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id);}}
                style={{background: '#d9534f', color: 'white', border: 'none', borderRadius: '10px', padding: '0px 6px', height: '18px', lineHeight: '18px', cursor: 'pointer', fontSize: '0.7em', marginLeft: '8px'}}
                title="Delete Session"
            >X</button>
          </li>
        ))}
      </ul>

      {sessions.length === 0 && !isLoading &&
        <div style={{ padding: '20px 10px', color: '#888', fontSize: '0.9em', textAlign: 'center', flexGrow: 1, display: 'flex', alignItems:'center', justifyContent:'center' }}>
          <p>No sessions saved yet. <br/>Use the form above to save your current connection details.</p>
        </div>
      }

      {selectedSessionId && sessions.find(s => s.id === selectedSessionId) && ( // Check if selected session still exists
        <div style={{ padding: '10px', borderTop: '1px solid #444', marginTop: 'auto', flexShrink: 0 }}>
          <button
            onClick={handleConnectSelected}
            style={{width: '100%', padding: '10px', boxSizing: 'border-box', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '1em'}}
          >
            Connect to "{sessions.find(s=>s.id === selectedSessionId)?.name || 'Selected'}"
          </button>
        </div>
      )}
    </div>
  );
};
export default SessionListView;