import React from 'react';
import Tab from './Tab';
import type { AppTabData } from '../App'; // Changed from TabStateData to AppTabData to match App.tsx export

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
    }}>
      {tabs.map(tab => (
        <Tab
          key={tab.id}
          id={tab.id}
          title={tab.title}
          isActive={tab.id === activeTabId}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          // Pass onDetachTab; Tab component will handle if it's undefined
          onDetachTab={onDetachTab ? () => onDetachTab(tab.id) : undefined}
        />
      ))}
      <button
        onClick={onAddTab}
        style={{
          padding: '6px 10px',
          marginLeft: '5px',
          marginBottom: '0px',
          background: '#555',
          border: '1px solid #666',
          color: 'white',
          cursor: 'pointer',
          borderTopLeftRadius: '4px',
          borderTopRightRadius: '4px',
          height: '37px',
          alignSelf: 'flex-start', // Keep it aligned with tab tops
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