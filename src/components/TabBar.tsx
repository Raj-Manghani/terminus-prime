import React from 'react';
import { SessionProfile } from './SessionManager'; // Assuming SessionProfile is needed for tab titles

interface TabInfo {
  id: string;
  title: string; // Title to display in the tab bar
  // Add other tab-specific info here if needed (e.g., icon, status indicator)
}

interface TabBarProps {
  tabs: TabInfo[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTabClick: () => void;
}

const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onNewTabClick,
}) => {
  return (
    <div style={styles.tabBar}>
      {tabs.map(tab => (
        <div
          key={tab.id}
          style={{
            ...styles.tab,
            ...(tab.id === activeTabId ? styles.activeTab : {}),
          }}
          onClick={() => onTabClick(tab.id)}
        >
          <span style={styles.tabTitle}>{tab.title}</span>
          {/* Close button - Always render */}
          <button
            style={styles.closeButton}
            onClick={(e) => {
              e.stopPropagation(); // Prevent tab click when closing
              onTabClose(tab.id);
            }}
          >
            x
          </button>
        </div>
      ))}
      {/* New Tab button */}
      <button style={styles.newTabButton} onClick={onNewTabClick}>
        +
      </button>
    </div>
  );
};

// Basic inline styles for the tab bar
const styles: { [key: string]: React.CSSProperties } = {
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#2d323b',
    padding: '0.3rem 0.5rem',
    borderBottom: '1px solid #333',
    overflowX: 'auto', // Allow scrolling if many tabs
    flexShrink: 0, // Prevent shrinking
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.4rem 0.8rem',
    marginRight: '0.3rem',
    borderRadius: '4px 4px 0 0',
    backgroundColor: '#3c414a',
    color: '#aaa',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  activeTab: {
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4',
  },
  tabTitle: {
    marginRight: '0.5rem',
    whiteSpace: 'nowrap', // Prevent wrapping
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: '0.9rem',
    padding: '0 0.2rem',
    marginLeft: '0.2rem',
  },
  newTabButton: {
    background: '#444',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0.4rem 0.8rem',
    cursor: 'pointer',
    fontSize: '1rem',
    marginLeft: '0.5rem',
    flexShrink: 0, // Prevent shrinking
  },
};

export default TabBar;
