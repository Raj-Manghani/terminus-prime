import React from 'react';
import Tab from './Tab';
// Assuming App.tsx exports AppTabData or a compatible type
import type { AppTabData } from '../App';

interface TabBarProps {
  tabs: AppTabData[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
  onDetachTab?: (tabId: string) => void;
}

const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
  onDetachTab
}) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      backgroundColor: '#2a2d35',
      padding: '5px 5px 0 5px',
      borderBottom: '1px solid #555',
      flexShrink: 0,
      overflowX: 'auto',
      overflowY: 'hidden',
      minHeight: '42px', // Ensure consistent height with tab content (37px + 5px padding-top)
      boxSizing: 'border-box',
    }}>
      {tabs.map(tab => (
        <Tab
          key={tab.id}
          id={tab.id}
          title={tab.title}
          isActive={tab.id === activeTabId}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          onDetachTab={onDetachTab} // Pass it down directly
        />
      ))}
      <button
        onClick={onAddTab}
        style={{
          padding: '6px 10px',
          marginLeft: '5px',
          // marginBottom: '1px', // Match potential lift of active tab
          background: '#555',
          border: '1px solid #666',
          color: 'white',
          cursor: 'pointer',
          borderTopLeftRadius: '4px',
          borderTopRightRadius: '4px',
          height: '37px',
          alignSelf: 'flex-end', // Changed to flex-end to align with bottom of tab bar
          lineHeight: 'normal',
        }}
        title="New Tab"
      >
        +
      </button>
    </div>
  );
};

export default TabBar;