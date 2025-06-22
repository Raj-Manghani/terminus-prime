import React from 'react';

interface TabProps {
  id: string;
  title: string;
  isActive: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onDetachTab?: (tabId: string) => void; // Optional: not available in detached windows
}

const Tab: React.FC<TabProps> = ({ id, title, isActive, onSelectTab, onCloseTab, onDetachTab }) => {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCloseTab(id);
  };

  const handleDetach = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDetachTab) {
      onDetachTab(id);
    }
  };

  return (
    <div
      onClick={() => onSelectTab(id)}
      style={{
        padding: '8px 12px',
        marginRight: '2px',
        border: isActive ? '1px solid #555' : '1px solid #333', // Corrected border color for inactive
        borderBottom: isActive ? 'none' : '1px solid #555', // Match active tab style for border-bottom
        backgroundColor: isActive ? '#4a4a4a' : '#333', // Active tab slightly lighter
        color: isActive ? 'white' : '#ccc',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        minWidth: '100px',
        maxWidth: '200px',
        borderTopLeftRadius: '4px',
        borderTopRightRadius: '4px',
        userSelect: 'none',
      }}
      title={title}
    >
      <span style={{ flexGrow: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {title}
      </span>
      {onDetachTab && (
        <button
          onClick={handleDetach}
          style={{
            marginLeft: '5px',
            background: 'none',
            border: '1px solid #777',
            color: '#aaa',
            cursor: 'pointer',
            padding: '1px 3px',
            borderRadius: '3px',
            fontSize: '0.8em',
            lineHeight: '1',
          }}
          onMouseOver={(e) => { e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = '#999'; }}
          onMouseOut={(e) => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#777'; }}
          title="Detach Tab"
        >
          ❐
        </button>
      )}
      <button
        onClick={handleClose}
        style={{
          marginLeft: (onDetachTab) ? '5px' : '8px', // Adjusted margin based on detach button presence
          background: 'none',
          border: 'none',
          color: '#aaa',
          cursor: 'pointer',
          padding: '2px 4px',
          borderRadius: '3px', // Consistent with detach button
          lineHeight: '1',
          fontSize: '0.9em' // Consistent with detach button icon size context
        }}
        onMouseOver={(e) => e.currentTarget.style.color = 'white'}
        onMouseOut={(e) => e.currentTarget.style.color = '#aaa'}
        title="Close Tab"
      >
        X
      </button>
    </div>
  );
};

export default Tab;