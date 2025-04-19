import React, { useState, useEffect } from 'react';
import AddEditSessionModal from './AddEditSessionModal'; // Import the modal
const { ipcRenderer } = require('electron'); // Use require for IPC

interface SessionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string; // Optional, for runtime use only
}

// Define the shape of a stored session (include id, omit password)
type StoredSessionProfile = Omit<SessionProfile, 'password'> & { id: string };

interface SessionManagerProps {
  onConnect: (session: SessionProfile) => void;
  // isTerminalConnected and currentSession props removed
}

const SessionManager: React.FC<SessionManagerProps> = ({ onConnect }) => {
  const [sessions, setSessions] = useState<StoredSessionProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false); // State for modal visibility
  const [sessionToEdit, setSessionToEdit] = useState<StoredSessionProfile | null>(null); // State for editing

  const fetchSessions = async () => {
    try {
      console.log('SessionManager: Requesting sessions from main process...');
      setIsLoading(true);
      const loadedSessions: StoredSessionProfile[] = await ipcRenderer.invoke('sessions:get');
      console.log('SessionManager: Received sessions:', loadedSessions);
      setSessions(loadedSessions || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError('Failed to load sessions.');
      setSessions([]); // Clear sessions on error
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    // TODO: Add listeners for session updates from main process if needed
  }, []); // Empty dependency array ensures this runs only once on mount

  const handleAddSessionClick = () => {
    console.log("Add session button clicked.");
    setSessionToEdit(null); // Clear sessionToEdit for adding
    setShowAddModal(true); // Show the modal
  };

  const handleEditSession = (session: StoredSessionProfile) => {
    console.log("Edit session clicked for:", session);
    setSessionToEdit(session); // Set session to edit
    setShowAddModal(true); // Show the modal
  };

  const handleDeleteSession = async (sessionId: string) => {
    console.log("Delete session clicked for ID:", sessionId);
    if (window.confirm(`Are you sure you want to delete session "${sessions.find(s => s.id === sessionId)?.name}"?`)) {
      try {
        await ipcRenderer.invoke('sessions:delete', sessionId);
        console.log("Session deleted via IPC.");
        await fetchSessions(); // Refresh the list after deleting
      } catch (err) {
        console.error("Error deleting session via IPC:", err);
        setError('Failed to delete session.'); // Show error in SessionManager UI
      }
    }
  };


  const handleSaveSession = async (sessionData: Omit<StoredSessionProfile, 'id'> | StoredSessionProfile) => {
    console.log("Attempting to save session:", sessionData);
    try {
      if ('id' in sessionData && sessionData.id) {
         // This is an update
         await ipcRenderer.invoke('sessions:update', sessionData);
         console.log("Session updated via IPC.");
      } else {
         // This is a new session
         await ipcRenderer.invoke('sessions:add', sessionData);
         console.log("Session added via IPC.");
      }
      await fetchSessions(); // Refresh the list after saving
    } catch (err) {
      console.error("Error saving session via IPC:", err);
      // Optionally show an error to the user in the modal or here
      throw err; // Re-throw to let modal handle UI feedback
    }
  };

  return (
    <div style={{
      background: '#23272e',
      color: '#d4d4d4',
      padding: '1rem',
      minWidth: 250,
      height: '100%',
      borderRight: '1px solid #333',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }}>
      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Sessions</h3>
      {isLoading && <p>Loading sessions...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!isLoading && !error && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1, overflowY: 'auto' }}>
          {sessions.length === 0 && <p>No sessions saved.</p>}
          {sessions.map(session => (
            <li key={session.id} style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                style={{
                  flexGrow: 1, // Allow button to take available space
                  background: '#2d323b',
                  color: '#d4d4d4',
                  border: 'none',
                  borderRadius: 4,
                  padding: '0.5rem',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  console.log('SessionManager: Clicked session', session);
                  onConnect(session as SessionProfile);
                }}
              >
                <strong>{session.name}</strong>
                <div style={{ fontSize: '0.85em', color: '#aaa' }}>
                  {session.username}@{session.host}:{session.port}
                </div>
              </button>
              {/* Edit/Delete buttons */}
              <button
                style={{
                  background: '#444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '0.3rem 0.6rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
                onClick={() => handleEditSession(session)}
                title="Edit session"
              >
                Edit
              </button>
              <button
                style={{
                  background: '#d33',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '0.3rem 0.6rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
                onClick={() => handleDeleteSession(session.id)}
                title="Delete session"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        style={{
          background: '#0078d4',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '0.5rem',
          marginTop: 'auto',
          cursor: 'pointer'
        }}
        onClick={handleAddSessionClick}
        title="Add new session"
      >
        + Add Session
      </button>

      {/* Render the modal conditionally */}
      {showAddModal && (
        <AddEditSessionModal
          sessionToEdit={sessionToEdit} // Pass session to edit
          onClose={() => setShowAddModal(false)}
          onSave={handleSaveSession}
        />
      )}
    </div>
  );
};

export type { SessionProfile, StoredSessionProfile };
export default SessionManager;
