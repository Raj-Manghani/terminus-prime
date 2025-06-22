import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import TerminalView from './components/TerminalView'; // Corrected path
import MasterPasswordModal from './components/MasterPasswordModal';
import SessionListView from './components/SessionListView';
import TabBar from './components/TabBar';
import PaneView from './components/PaneView';
import type { SessionProfile, SshConnectionDetails as PreloadSshDetails, PaneData as PreloadPaneData, SetMasterKeyResult } from '../../preload';
import type { TerminalInstance as PreloadTerminalInstance } from '../../preload';
import './App.css';
import 'allotment/dist/style.css';

export interface TerminalInstance extends PreloadTerminalInstance {
  id: string; sshConnectionArgs?: PreloadSshDetails; sshStatus: string; title: string; fitTriggerCount: number;
}
export interface PaneData extends PreloadPaneData {
  id: string; type: 'terminal' | 'split'; terminalInstanceId?: string; children?: PaneData[]; direction?: 'horizontal' | 'vertical'; size?: number | string;
}
export interface AppTabData {
  id: string; title: string; rootPane: PaneData; activeTerminalInstanceId: string | null;
}

const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMasterPasswordModalOpen, setIsMasterPasswordModalOpen] = useState(false);
  const [masterPasswordMessage, setMasterPasswordMessage] = useState('');
  const [isSettingNewPasswordDialog, setIsSettingNewPasswordDialog] = useState(false);
  const [appUnlocked, setAppUnlocked] = useState(false);
  const [keytarAvailable, setKeytarAvailable] = useState<boolean | null>(null);
  const [formHost, setFormHost] = useState('test.rebex.net');
  const [formPort, setFormPort] = useState('22');
  const [formUsername, setFormUsername] = useState('demo');
  const [formPassword, setFormPassword] = useState('password');
  const [tabs, setTabs] = useState<AppTabData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [terminalInstances, setTerminalInstances] = useState<Map<string, TerminalInstance>>(new Map());
  const [terminalWriteData, setTerminalWriteData] = useState<{ terminalInstanceId: string, data: string } | null>(null);
  const [terminalClearTrigger, setTerminalClearTrigger] = useState<{ terminalInstanceId: string, trigger: number } | null>(null);

  const [isUiElementFocused, setIsUiElementFocused] = useState(false); // New state

  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

  const handleUiElementFocusChange = useCallback((isFocused: boolean) => {
    // console.log("App: UI Element Focus Changed:", isFocused);
    setIsUiElementFocused(isFocused);
  }, []);

  const triggerFitForTerminal = useCallback((terminalInstanceId: string) => { /* ... as before ... */
    setTerminalInstances(prev => { const inst = prev.get(terminalInstanceId); if (inst) return new Map(prev).set(terminalInstanceId, { ...inst, fitTriggerCount: (inst.fitTriggerCount || 0) + 1 }); return prev; });
  }, []);
  const getFitTriggerCount = useCallback((terminalInstanceId: string): number | undefined => { return terminalInstances.get(terminalInstanceId)?.fitTriggerCount; }, [terminalInstances]);
  const collectTerminalIdsRecursive = (pane: PaneData): string[] => { /* ... as before ... */
    if (pane.type === 'terminal' && pane.terminalInstanceId) return [pane.terminalInstanceId];
    if (pane.type === 'split' && pane.children) return pane.children.flatMap(collectTerminalIdsRecursive);
    return [];
  };
  const createNewTerminalInstance = useCallback((sshArgs?: PreloadSshDetails, title?: string): TerminalInstance => { /* ... as before ... */
    const termId = uuidv4();
    return { id: termId, sshConnectionArgs: sshArgs, sshStatus: 'disconnected', title: title || `Terminal ${terminalInstances.size + 1}`, fitTriggerCount: 0 };
  }, [terminalInstances.size]);
  const createNewTerminalPane = useCallback((instance: TerminalInstance): PaneData => { /* ... as before ... */
    return { id: uuidv4(), type: 'terminal', terminalInstanceId: instance.id, size: '100%' };
  }, []);
  const updateTerminalInstance = useCallback((terminalInstanceId: string, updates: Partial<Omit<TerminalInstance, 'fitTriggerCount'>>) => { /* ... as before ... */
    setTerminalInstances(prevMap => {
        const current = prevMap.get(terminalInstanceId);
        if (!current) return prevMap;
        const updatedInstance = { ...current, ...updates, fitTriggerCount: current.fitTriggerCount };
        const newMap = new Map(prevMap).set(terminalInstanceId, updatedInstance);
        setTabs(prevTabs => prevTabs.map(tab => (tab.activeTerminalInstanceId === terminalInstanceId) ? { ...tab, title: updatedInstance.title } : tab ));
        return newMap;
    });
  }, []);
  const handleAddTab = useCallback((connectSession?: SessionProfile) => { /* ... as before ... */
    const { pane: newPane, instance: newInstance } = createNewTerminalPane(connectSession ? { host: connectSession.host, port: connectSession.port, username: connectSession.username, password: connectSession.password } : undefined, connectSession ? `${connectSession.username}@${connectSession.host}` : undefined);
    const newTabId = uuidv4(); const newTab: AppTabData = { id: newTabId, title: newInstance.title, rootPane: newPane, activeTerminalInstanceId: newInstance.id };
    setTerminalInstances(prev => new Map(prev).set(newInstance.id, newInstance));
    setTabs(prevTabs => [...prevTabs, newTab]); setActiveTabId(newTabId);
    if (connectSession && newInstance.sshConnectionArgs) { window.electronAPI.sshConnect({ terminalInstanceId: newInstance.id, details: newInstance.sshConnectionArgs }); updateTerminalInstance(newInstance.id, { sshStatus: 'connecting' }); }
  }, [createNewTerminalPane, updateTerminalInstance]);
  const checkMasterKeyAndLockStatus = useCallback(async () => { /* ... as before ... */
    if (!window.electronAPI) { setTimeout(checkMasterKeyAndLockStatus, 100); return; }
    const isSet = await window.electronAPI.isMasterKeySet();
    if (isSet) { setAppUnlocked(true); setIsMasterPasswordModalOpen(false); if (tabs.length === 0) { handleAddTab(); } else if (activeTabId) { const currentT = tabs.find(t => t.id === activeTabId); if (currentT) collectTerminalIdsRecursive(currentT.rootPane).forEach(triggerFitForTerminal);}}
    else { setAppUnlocked(false); const keytarWorks = await window.electronAPI.checkKeytarStatus(); setKeytarAvailable(keytarWorks === 'available'); setIsSettingNewPasswordDialog(keytarWorks !== 'available'); setMasterPasswordMessage( keytarWorks === 'available' ? "Enter master password..." : "Enter master password (keychain N/A)..."); setIsMasterPasswordModalOpen(true); }
  }, [tabs, activeTabId, handleAddTab, updateTerminalInstance, triggerFitForTerminal]); // Removed terminalInstances
  useEffect(() => { checkMasterKeyAndLockStatus(); }, [checkMasterKeyAndLockStatus]);
  const handleMasterPasswordSubmit = async (password: string): Promise<boolean> => { /* ... as before ... */
    const result = await window.electronAPI.setMasterKeyFromPassword(password, keytarAvailable ?? false);
    if (result.success) { // Assuming result is {success: boolean, saltHex?: string}
        const isNowSet = await window.electronAPI.isMasterKeySet();
        if (isNowSet) { setAppUnlocked(true); setIsMasterPasswordModalOpen(false); checkMasterKeyAndLockStatus(); return true; }
    }
    setAppUnlocked(false); return false;
  };
  const handleAppLock = useCallback(async () => { /* ... as before ... */
    if (window.electronAPI) await window.electronAPI.clearMasterKey(); setAppUnlocked(false);
    tabs.forEach(tab => collectTerminalIdsRecursive(tab.rootPane).forEach(termId => { const instance = terminalInstances.get(termId); if (instance && (instance.sshStatus === 'connected' || instance.sshStatus === 'connecting')) { window.electronAPI.sshDisconnect({terminalInstanceId: termId}); }}));
    checkMasterKeyAndLockStatus();
  }, [tabs, terminalInstances, checkMasterKeyAndLockStatus]);
  const handleSelectTab = (tabId: string) => { if (tabId !== activeTabId) setActiveTabId(tabId); };
  const handleCloseTab = useCallback((tabId: string) => { /* ... as before ... */
    const tabToClose = tabs.find(t => t.id === tabId);
    if (tabToClose) { collectTerminalIdsRecursive(tabToClose.rootPane).forEach(termId => { const instance = terminalInstances.get(termId); if (instance && (instance.sshStatus === 'connected' || instance.sshStatus === 'connecting')) { window.electronAPI.sshDisconnect({ terminalInstanceId: termId }); } setTerminalInstances(prev => { const m = new Map(prev); m.delete(termId); return m; }); }); }
    setTabs(prevTabs => { const newTabs = prevTabs.filter(tab => tab.id !== tabId); if (activeTabId === tabId) { if (newTabs.length > 0) { const closedTabIndex = prevTabs.findIndex(t => t.id === tabId); setActiveTabId(newTabs[Math.max(0, closedTabIndex -1)].id); } else { setActiveTabId(null); handleAddTab(); } } return newTabs; });
  }, [tabs, activeTabId, terminalInstances, handleAddTab]);
  useEffect(() => { if (appUnlocked && tabs.length === 0 && activeTabId === null) handleAddTab(); }, [appUnlocked, tabs.length, activeTabId, handleAddTab]);
  const setActivePaneInTab = useCallback((tabId: string, terminalInstanceId: string) => { /* ... as before ... */
    setTabs(prevTabs => prevTabs.map(t => { if (t.id === tabId) { const termInst = terminalInstances.get(terminalInstanceId); return { ...t, activeTerminalInstanceId: terminalInstanceId, title: termInst?.title || t.title }; } return t; }));
    triggerFitForTerminal(terminalInstanceId);
  }, [terminalInstances, triggerFitForTerminal]);
  const _splitPaneRecursive = useCallback((currentPane: PaneData, targetPaneId: string, direction: 'horizontal' | 'vertical', newTerminalPaneData: PaneData): PaneData => { /* ... as before ... */
    if (currentPane.id === targetPaneId) { if (currentPane.type !== 'terminal') return currentPane; return { id: uuidv4(), type: 'split', direction, children: [ { ...currentPane, size: '50%', id: uuidv4() }, { ...newTerminalPaneData, size: '50%' } ] }; }
    if (currentPane.type === 'split' && currentPane.children) { return { ...currentPane, children: currentPane.children.map(child => _splitPaneRecursive(child, targetPaneId, direction, newTerminalPaneData)) }; } return currentPane;
  }, []);
  const findPaneIdByTerminalId = useCallback((pane: PaneData, termId: string): string | null => { /* ... as before ... */
    if (pane.type === 'terminal' && pane.terminalInstanceId === termId) return pane.id;
    if (pane.type === 'split' && pane.children) { for (const child of pane.children) { const found = findPaneIdByTerminalId(child, termId); if (found) return found; } } return null;
  }, []);
  const handleSplitPane = useCallback((direction: 'horizontal' | 'vertical') => { /* ... as before ... */
    if (!activeTabId) return; const currentTab = tabs.find(t => t.id === activeTabId); if (!currentTab || !currentTab.activeTerminalInstanceId) return;
    const targetPaneIdToSplit = findPaneIdByTerminalId(currentTab.rootPane, currentTab.activeTerminalInstanceId); if (!targetPaneIdToSplit) { console.warn("Target pane to split not found"); return; }
    const { pane: newPaneData, instance: newInstance } = createNewTerminalPane(); setTerminalInstances(prev => new Map(prev).set(newInstance.id, newInstance));
    const newRootPane =_splitPaneRecursive(currentTab.rootPane, targetPaneIdToSplit, direction, newPaneData);
    setTabs(prevTabs => prevTabs.map(t => { if (t.id === activeTabId) { return { ...t, rootPane: newRootPane, activeTerminalInstanceId: newInstance.id }; } return t; }));
    triggerFitForTerminal(newInstance.id);
  }, [activeTabId, tabs, findPaneIdByTerminalId, createNewTerminalPane, _splitPaneRecursive, terminalInstances, triggerFitForTerminal]);

  useEffect(() => { /* SSH Status and Data listeners - as before */
    if (!appUnlocked || !window.electronAPI?.onSshStatus) return;
    const unsubStatus = window.electronAPI.onSshStatus(event => { const inst = terminalInstances.get(event.terminalInstanceId); let newTitle = event.message.substring(0,30); if(inst) { newTitle = (event.status === 'connected' && inst.sshConnectionArgs) ? `${inst.sshConnectionArgs.username}@${inst.sshConnectionArgs.host}` : (event.status === 'disconnected' ? `Terminal ${[...terminalInstances.keys()].indexOf(event.terminalInstanceId) + 1}` : newTitle); } updateTerminalInstance(event.terminalInstanceId, {sshStatus: event.status, title: newTitle}); });
    const unsubData = window.electronAPI.onSshData(event => { setTerminalWriteData({ terminalInstanceId: event.terminalInstanceId, data: event.data }); });
    return () => { unsubStatus(); unsubData(); };
  }, [appUnlocked, updateTerminalInstance, terminalInstances]);

  useEffect(() => { /* Fit on activeTabId/isSidebarOpen change - as before */
    if (appUnlocked && activeTabId) { const currentTab = tabs.find(t => t.id === activeTabId); if (currentTab) { collectTerminalIdsRecursive(currentTab.rootPane).forEach(termId => { triggerFitForTerminal(termId); }); } }
  }, [appUnlocked, activeTabId, tabs, isSidebarOpen, triggerFitForTerminal]);

  const handleTerminalDataInput = useCallback((terminalInstanceId: string, data: string) => {
    if (isUiElementFocused) return; // Check focus state
    const instance = terminalInstances.get(terminalInstanceId); if (appUnlocked && instance && instance.sshStatus === 'connected') { window.electronAPI.sshSendData({ terminalInstanceId, data }); }
  }, [appUnlocked, terminalInstances, isUiElementFocused]); // Added isUiElementFocused

  const handleTerminalResize = useCallback((terminalInstanceId: string, cols: number, rows: number, height: number, width: number) => { /* ... */ }, [appUnlocked, terminalInstances]);
  const getBufferForTerminal = useCallback((terminalInstanceId: string): string | undefined => { /* ... */ }, [terminalWriteData]);
  const connectAdHocToActive = () => { /* ... */ };
  const connectFromSessionToActive = (session: SessionProfile) => { /* ... */ };

  const currentActiveTab = tabs.find(tab => tab.id === activeTabId);
  const currentActiveTerminalInstance = currentActiveTab?.activeTerminalInstanceId ? terminalInstances.get(currentActiveTab.activeTerminalInstanceId) : null;

  return (
    <div className="App">
      <MasterPasswordModal isOpen={isMasterPasswordModalOpen} onPasswordSubmit={handleMasterPasswordSubmit} message={masterPasswordMessage} isSettingNewPassword={isSettingNewPasswordDialog}/>
      <header className="App-header"> {/* ... Header with toggleSidebar ... */} </header>
      {appUnlocked && <TabBar tabs={tabs} activeTabId={activeTabId} onSelectTab={handleSelectTab} onCloseTab={handleCloseTab} onAddTab={() => handleAddTab()} /* onDetachTab removed */ />}
      <div className="App-body">
        {appUnlocked && (
          <aside className={`sidebar ${isSidebarOpen ? "open" : "closed"}`} >
            <div className="sidebar-header" style={{padding: '10px', borderBottom: '1px solid #444', flexShrink: 0 }}>
              <h2 style={{margin:0, fontSize: '1.1em'}}>Sessions</h2>
            </div>
            <div className="sidebar-content" style={{flexGrow: 1, overflowY: 'auto', overflowX: 'hidden'}}>
              <SessionListView
                appUnlocked={appUnlocked}
                currentConnectionDetails={{ host: formHost, port: formPort, username: formUsername, password: formPassword }}
                onConnectSession={connectFromSessionToActive}
                onUiElementFocusChange={handleUiElementFocusChange} // Pass callback
              />
            </div>
          </aside>
        )}
        <main className="App-content" style={!isSidebarOpen ? {width: '100vw', borderLeft:'none'} : {} }>
          {appUnlocked && tabs.map(tab => (
            <div key={tab.id} className="tab-content-wrapper" style={{ display: tab.id === activeTabId ? 'flex' : 'none', flexDirection: 'column', width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
               <PaneView
                  key={tab.rootPane.id + tab.id}
                  pane={tab.rootPane}
                  terminalInstances={terminalInstances}
                  onTerminalData={handleTerminalDataInput}
                  onTerminalResize={handleTerminalResize}
                  getTerminalDataToDisplay={getBufferForTerminal}
                  isActivePane={(termId) => termId === tab.activeTerminalInstanceId}
                  onPaneClick={(_paneId, termId) => termId && setActivePaneInTab(tab.id, termId)}
                  getTriggerFitCount={getFitTriggerCount}
                  isUiElementFocused={isUiElementFocused} // Pass focus state down
                />
            </div>
          ))}
          {/* Placeholders ... */}
        </main>
      </div>
    </div>
  );
}
export default App;
