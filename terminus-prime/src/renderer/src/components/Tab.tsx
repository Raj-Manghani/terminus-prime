import React from 'react';

interface TabProps {
  id: string;
  title: string;
  isActive: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onDetachTab?: (tabId: string) => void; // Optional for main window tabs
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
        padding: '8px 12px', marginRight: '2px', borderBottom: 'none',
        border: isActive ? '1px solid #555' : '1px solid #2a2d35',
        borderBottomColor: isActive ? 'transparent' : '#555',
        backgroundColor: isActive ? '#1e1e1e' : '#333',
        color: isActive ? 'white' : '#ccc', cursor: 'pointer', display: 'flex',
        alignItems: 'center', minWidth: '120px', maxWidth: '220px',
        borderTopLeftRadius: '4px', borderTopRightRadius: '4px',
        position: 'relative', top: isActive ? '1px' : '0px',
        zIndex: isActive ? 2 : 1,
        boxShadow: isActive ? '0 -2px 5px rgba(0,0,0,0.1)' : 'none',
      }}
      title={title}
    >
      <span style={{ flexGrow: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '5px' }}>
        {title}
      </span>
      {onDetachTab && ( // Conditionally render detach button
        <button
          onClick={handleDetach}
          style={{
            marginLeft: '5px', background: 'none', border: '1px solid #777',
            color: '#aaa', cursor: 'pointer', padding: '1px 3px',
            borderRadius: '3px', fontSize: '0.8em', lineHeight: '1'
          }}
          onMouseOver={(e) => { e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = '#999'; }}
          onMouseOut={(e) => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#777'; }}
          title="Detach Tab to New Window"
        >
          ❐
        </button>
      )}
      <button
        onClick={handleClose}
        style={{
          marginLeft: onDetachTab ? '5px' : 'auto', // Adjust margin if detach button is present
          background: 'none', border: 'none', color: '#aaa', cursor: 'pointer',
          padding: '2px 4px', borderRadius: '50%', lineHeight: '1', fontSize: '0.9em',
          width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#555'; e.currentTarget.style.color = 'white';}}
        onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#aaa';}}
        title="Close Tab"
      >
        &#x2715;
      </button>
    </div>
  );
};
export default Tab;
