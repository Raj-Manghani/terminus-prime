import React, { useEffect } from 'react';

interface TabProps {
  id: string;
  title: string;
  isActive: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onDetachTab?: (tabId: string) => void;
}

const Tab: React.FC<TabProps> = ({ id, title, isActive, onSelectTab, onCloseTab, onDetachTab }) => {

  useEffect(() => {
    // Example logging, can be made more specific or removed after debugging
    // console.log(`Tab '${title}' (ID: ${id}): onDetachTab prop type: ${typeof onDetachTab}`);
  }, [id, title, onDetachTab]);

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

  const titleSpanStyle: React.CSSProperties = {
    flexGrow: 1,
    flexShrink: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginRight: 'auto', // Pushes buttons to the right if space available
  };

  // To use diagnostic style, change `normalDetachButtonStyle` to `diagnosticDetachButtonStyle` below
  const diagnosticDetachButtonStyle: React.CSSProperties = {
    marginLeft: '5px', background: 'red', border: '2px solid yellow', color: 'white',
    cursor: 'pointer', padding: '2px 4px', borderRadius: '3px', fontSize: '1em', lineHeight: '1', zIndex: 9999,
    flexShrink: 0, // Prevent button from shrinking
  };

  const normalDetachButtonStyle: React.CSSProperties = {
    marginLeft: '5px', background: 'none', border: '1px solid #777', color: '#aaa',
    cursor: 'pointer', padding: '1px 3px', borderRadius: '3px', fontSize: '0.8em', lineHeight: '1',
    flexShrink: 0,
  };

  const detachButtonStyle = normalDetachButtonStyle;

  return (
    <div
      onClick={() => onSelectTab(id)}
      style={{
        padding: '8px 12px',
        marginRight: '2px',
        border: isActive ? '1px solid #555' : '1px solid #2a2d35', // Match TabBar bg for inactive border
        borderBottomColor: isActive ? 'transparent' : '#555',
        backgroundColor: isActive ? '#1e1e1e' : '#333', // Main content bg for active, slightly lighter for inactive
        color: isActive ? 'white' : '#ccc',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start', // Align items to start, title span will push buttons
        minWidth: '120px',
        maxWidth: '220px',
        height: '37px', // Set a fixed height to match add button and ensure alignment
        boxSizing: 'border-box',
        borderTopLeftRadius: '4px',
        borderTopRightRadius: '4px',
        userSelect: 'none',
        position: 'relative',
        top: isActive ? '1px' : '0px',
        zIndex: isActive ? 2 : 1,
      }}
      title={title}
    >
      <span style={titleSpanStyle}>
        {title}
      </span>
      {/* Button Group */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {onDetachTab && (
          <button
            onClick={handleDetach}
            style={detachButtonStyle}
            onMouseOver={(e) => { if (detachButtonStyle === normalDetachButtonStyle) { e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = '#999'; }}}
            onMouseOut={(e) => { if (detachButtonStyle === normalDetachButtonStyle) { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#777'; }}}
            title="Detach Tab"
          >
            ❐
          </button>
        )}
        <button
          onClick={handleClose}
          style={{
            marginLeft: '5px', // Consistent margin
            background: 'none', border: 'none', color: '#aaa', cursor: 'pointer',
            padding: '2px 4px', borderRadius: '3px', lineHeight: '1', fontSize: '0.9em',
            flexShrink: 0,
          }}
          onMouseOver={(e) => e.currentTarget.style.color = 'white'}
          onMouseOut={(e) => e.currentTarget.style.color = '#aaa'}
          title="Close Tab"
        >
          X
        </button>
      </div>
    </div>
  );
};

export default Tab;