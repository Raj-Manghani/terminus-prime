import React from 'react';
import Tab from './Tab';
// Assuming App.tsx will export TabData type, or it's in a shared types file
// For now, using a relative path that would work if App.tsx is one level up from components/
import type { TabData } from '../App';

interface TabBarProps {
  tabs: TabData[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
}

const TabBar: React.FC<TabBarProps> = ({ tabs, activeTabId, onSelectTab, onCloseTab, onAddTab }) => {
  return (
    <div style={{
        display: 'flex', alignItems: 'flex-end',
        backgroundColor: '#2a2d35', padding: '5px 5px 0 5px',
        borderBottom: '1px solid #555',
        minHeight: '40px', // Ensure tab bar has a minimum height
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
        />
      ))}
      <button
        onClick={onAddTab}
        style={{
          padding: '0px 8px', // Adjusted padding
          marginLeft: '4px', // Consistent margin
          marginBottom: '0px', // Align with bottom border of tab bar
          background: '#4CAF50', // Greenish add button
          border: '1px solid #388E3C',
          color: 'white',
          cursor: 'pointer',
          borderTopLeftRadius: '4px',
          borderTopRightRadius: '4px',
          fontSize: '1.2em', // Make '+' bigger
          height: '32px', // Approx height of tabs before active adjustment
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'flex-end', // Align with the bottom of the flex container
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
