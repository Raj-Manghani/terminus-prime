import React from 'react';
import TerminalView from './TerminalView';
import { SessionProfile } from './SessionManager';

interface TabProps {
  id: string;
  session: SessionProfile | null;
  isActive: boolean;
  onClose: (tabId: string) => void;
  // isConnected and reconnectTrigger props removed
}

const Tab: React.FC<TabProps> = ({
  id,
  session,
  isActive,
  onClose,
}) => {
  // Always render TerminalView; it will handle the null session case internally.
  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: isActive ? 'flex' : 'none', // Show only active tab
        flexDirection: 'column',
        position: 'relative', // Needed for absolute positioning of potential future elements
      }}
    >
      <TerminalView
        tabId={id} // Pass the tab's unique ID
        session={session} // Pass the tab's session data (can be null)
        isActive={isActive} // Pass the isActive prop
        // isConnected and reconnectTrigger are managed internally by TerminalView
      />
      {/* The placeholder logic is now moved inside TerminalView */}
      {/* Close button (optional, can be in TabBar) */}
      {/* <button onClick={() => onClose(id)} style={{ position: 'absolute', top: 5, right: 5 }}>X</button> */}
    </div>
  );
};

export default Tab;
