import React from 'react';
import { Allotment } from 'allotment';
// import 'allotment/dist/style.css'; // Imported in App.tsx
import TerminalView from './TerminalView'; // Corrected path
import type { PaneData, TerminalInstance } from '../App';

interface PaneViewProps {
  pane: PaneData;
  terminalInstances: Map<string, TerminalInstance>;
  onTerminalData: (terminalInstanceId: string, data: string) => void;
  onTerminalResize: (terminalInstanceId: string, cols: number, rows: number, height: number, width: number) => void;
  getTerminalDataToDisplay: (terminalInstanceId: string) => string | undefined;
  getTerminalClearTrigger?: (terminalInstanceId: string) => number | undefined;
  getTriggerFitCount?: (terminalInstanceId: string) => number | undefined; // New prop from App.tsx
  isActivePane: (terminalInstanceId: string | undefined) => boolean;
  onPaneClick: (paneId: string, terminalInstanceId?: string) => void;
}

const PaneView: React.FC<PaneViewProps> = React.memo(({
  pane, terminalInstances, onTerminalData, onTerminalResize,
  getTerminalDataToDisplay, getTerminalClearTrigger, getTriggerFitCount, // Destructure new prop
  isActivePane, onPaneClick,
}) => {
  if (pane.type === 'split' && pane.children) {
    return (
      <Allotment vertical={pane.direction === 'vertical'} key={pane.id}>
        {pane.children.map(childPane => (
          <Allotment.Pane key={childPane.id} preferredSize={childPane.size || '100%'}>
            <PaneView {...{
                pane: childPane, terminalInstances, onTerminalData, onTerminalResize,
                getTerminalDataToDisplay, getTerminalClearTrigger, getTriggerFitCount, // Pass down
                isActivePane, onPaneClick
            }} />
          </Allotment.Pane>
        ))}
      </Allotment>
    );
  } else if (pane.type === 'terminal' && pane.terminalInstanceId) {
    const terminalInstance = terminalInstances.get(pane.terminalInstanceId);
    if (!terminalInstance) return <div style={{padding:10, color:'red'}}>Terminal Instance {pane.terminalInstanceId} not found</div>;

    const isCurrentlyActive = isActivePane(pane.terminalInstanceId);
    return (
      <div
        onClick={() => onPaneClick(pane.id, pane.terminalInstanceId)}
        style={{ width: '100%', height: '100%', border: isCurrentlyActive ? '2px solid dodgerblue' : '1px solid #2c2c2e', boxSizing: 'border-box', overflow: 'hidden' }}
      >
        <TerminalView
          key={terminalInstance.id}
          onData={(data) => onTerminalData(terminalInstance.id, data)}
          onResize={(cols, rows, h, w) => onTerminalResize(terminalInstance.id, cols, rows, h, w)}
          dataToDisplay={getTerminalDataToDisplay(terminalInstance.id)}
          clearTrigger={getTerminalClearTrigger ? getTerminalClearTrigger(terminalInstance.id) : undefined}
          triggerFit={getTriggerFitCount ? getTriggerFitCount(terminalInstance.id) : undefined} // Pass to TerminalView
        />
      </div>
    );
  }
  return <div style={{padding:10, color:'orange'}}>Invalid Pane Config for {pane.id}</div>;
});
export default PaneView;
