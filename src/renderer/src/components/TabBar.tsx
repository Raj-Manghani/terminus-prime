import React from 'react';
import Tab from './Tab';
// Assuming App.tsx will export TabData type, or it's in a shared types file
import type { TabData } from '../App';

interface TabBarProps {
  tabs: TabData[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
  onDetachTab?: (tabId: string) => void; // Optional as detached windows won't pass it
}

const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
  onDetachTab // Correctly destructured as part of the first props object
}) => {
  return (
    <div style={{
        display: 'flex', alignItems: 'flex-end',
        backgroundColor: '#2a2d35', padding: '5px 5px 0 5px',
        borderBottom: '1px solid #555',
        minHeight: '40px',
        boxSizing: 'border-box'
    }}>
      {tabs.map(tab => (
        <Tab
          key={tab.id}
          id={tab.id}
          title={tab.title}
          isActive={tab.id === activeTabId}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          onDetachTab={onDetachTab} // Pass it down to Tab component
        />
      ))}
      <button
        onClick={onAddTab}
        style={{
          padding: '0px 8px',
          marginLeft: '4px',
          marginBottom: '0px',
          background: '#4CAF50',
          border: '1px solid #388E3C',
          color: 'white',
          cursor: 'pointer',
          borderTopLeftRadius: '4px',
          borderTopRightRadius: '4px',
          fontSize: '1.2em',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'flex-end',
          lineHeight: '1',
        }}
        title="New Tab"
      >
        +
      </button>
    </div>
  );
};

export default TabBar;
