import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import TerminalView from './components/TerminalView'; // Corrected path
import MasterPasswordModal from './components/MasterPasswordModal';
import SessionListView from './components/SessionListView';
import TabBar from './components/TabBar';
import PaneView from './components/PaneView';
import type { SessionProfile, SshConnectionDetails as PreloadSshDetails, TabDataFromRenderer, PaneData as PreloadPaneData, SetMasterKeyResult } from '../../preload';
// Import TerminalInstance type from preload if it includes fitTriggerCount, or define locally
import type { TerminalInstance as PreloadTerminalInstance } from '../../preload';
import './App.css';
import 'allotment/dist/style.css';

export interface TerminalInstance extends PreloadTerminalInstance {
  fitTriggerCount: number;
}
export interface PaneData extends PreloadPaneData {}
export interface AppTabData extends Omit<TabDataFromRenderer, 'containedTerminalInstances' | 'rootPane'> {
  rootPane: PaneData;
  // containedTerminalInstances is part of TabDataFromRenderer, not directly stored in AppTabData here
}

const getQueryParam = (param: string): string | null => new URLSearchParams(window.location.search).get(param);

const App: React.FC = () => {
  const [isDetachedWindow, setIsDetachedWindow] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMasterPasswordModalOpen, setIsMasterPasswordModalOpen] = useState(false);
  const [masterPasswordMessage, setMasterPasswordMessage] = useState('');
  const [appUnlocked, setAppUnlocked] = useState(false);
  const [keytarAvailable, setKeytarAvailable] = useState<boolean | null>(null);
  const [isSettingNewPasswordDialog, setIsSettingNewPasswordDialog] = useState(false);


  const [formHost, setFormHost] = useState('test.rebex.net');
  const [formPort, setFormPort] = useState('22');
  const [formUsername, setFormUsername] = useState('demo');
  const [formPassword, setFormPassword] = useState('password');

  const [tabs, setTabs] = useState<AppTabData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const [terminalInstances, setTerminalInstances] = useState<Map<string, TerminalInstance>>(new Map());
  const [terminalWriteData, setTerminalWriteData] = useState<{ terminalInstanceId: string, data: string } | null>(null);
  const [terminalClearTrigger, setTerminalClearTrigger] = useState<{ terminalInstanceId: string, trigger: number } | null>(null);

  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

  const triggerFitForTerminal = useCallback((terminalInstanceId: string) => {
    setTerminalInstances(prev => {
      const inst = prev.get(terminalInstanceId);
      if (inst) {
        console.log(`App: Triggering fit for terminal instance ${terminalInstanceId}, current count: ${inst.fitTriggerCount}`);
        return new Map(prev).set(terminalInstanceId, { ...inst, fitTriggerCount: (inst.fitTriggerCount || 0) + 1 });
      }
      return prev;
    });
  }, []); // Empty deps, as setTerminalInstances uses functional update

  const getFitTriggerCount = useCallback((terminalInstanceId: string): number | undefined => {
    return terminalInstances.get(terminalInstanceId)?.fitTriggerCount;
  }, [terminalInstances]);

  const createNewTerminalInstance = useCallback((sshArgs?: PreloadSshDetails, title?: string): TerminalInstance => {
    const termId = uuidv4();
    return { id: termId, sshConnectionArgs: sshArgs, sshStatus: 'disconnected', title: title || `Terminal ${terminalInstances.size + 1}`, fitTriggerCount: 0 };
  }, [terminalInstances.size]);

  const createNewTerminalPane = useCallback((instance: TerminalInstance): PaneData => {
    return { id: uuidv4(), type: 'terminal', terminalInstanceId: instance.id, size: '100%' };
  }, []);

  const updateTerminalInstance = useCallback((terminalInstanceId: string, updates: Partial<Omit<TerminalInstance, 'fitTriggerCount'>>) => {
    setTerminalInstances(prevMap => {
        const current = prevMap.get(terminalInstanceId);
        if (!current) return prevMap;
        const updatedInstance = { ...current, ...updates, fitTriggerCount: current.fitTriggerCount }; // Preserve fitTriggerCount
        const newMap = new Map(prevMap).set(terminalInstanceId, updatedInstance);
        setTabs(prevTabs => prevTabs.map(tab => {
            if (const_collectTerminalIds(tab.rootPane).includes(terminalInstanceId) && tab.activeTerminalInstanceId === terminalInstanceId) {
                return { ...tab, title: updatedInstance.title };
            } return tab;
        }));
        // No need to update containedTerminalInstances in AppTabData here as it's for detach snapshot
        return newMap;
    });
  }, []);

  const handleAddTab = useCallback((sessionToConnect?: SessionProfile, isDetachedTabData?: TabDataFromRenderer) => {
    let initialInstancesToAdd: TerminalInstance[] = [];
    let rootPaneStructure: PaneData;
    let tabTitle: string;
    let newTabActiveTerminalId: string | null = null;
    const newTabId = isDetachedTabData ? isDetachedTabData.id : uuidv4();

    if (isDetachedTabData) {
        rootPaneStructure = isDetachedTabData.rootPane;
        tabTitle = isDetachedTabData.title;
        initialInstancesToAdd = isDetachedTabData.containedTerminalInstances.map(ti => ({...ti, sshStatus: 'disconnected', fitTriggerCount: 0}));
        newTabActiveTerminalId = isDetachedTabData.activeTerminalInstanceId;
    } else {
        const instanceDetails = sessionToConnect ? { host: sessionToConnect.host, port: sessionToConnect.port, username: sessionToConnect.username, password: sessionToConnect.password } : undefined;
        const instanceTitle = sessionToConnect ? `${sessionToConnect.username}@${sessionToConnect.host}` : `Terminal ${tabs.length + 1 + terminalInstances.size}`;
        const newInstance = createNewTerminalInstance(instanceDetails, instanceTitle);
        rootPaneStructure = createNewTerminalPane(newInstance);
        tabTitle = newInstance.title;
        initialInstancesToAdd.push(newInstance);
        newTabActiveTerminalId = newInstance.id;
    }
    setTerminalInstances(prev => { const newMap = new Map(prev); initialInstancesToAdd.forEach(inst => newMap.set(inst.id, inst)); return newMap; });
    const newTab: AppTabData = { id: newTabId, title: tabTitle, rootPane: rootPaneStructure, activeTerminalInstanceId: newTabActiveTerminalId };
    setTabs(prevTabs => [...prevTabs, newTab]);
    setActiveTabId(newTabId); // This will trigger fit via useEffect on activeTabId

    if (sessionToConnect && !isDetachedTabData && initialInstancesToAdd[0]?.sshConnectionArgs) {
      updateTerminalInstance(initialInstancesToAdd[0].id, { sshStatus: 'connecting' });
      window.electronAPI.sshConnect({ terminalInstanceId: initialInstancesToAdd[0].id, details: initialInstancesToAdd[0].sshConnectionArgs });
    } else if (isDetachedTabData && appUnlocked) {
        initialInstancesToAdd.forEach(inst => {
            if (inst.sshConnectionArgs) {
                updateTerminalInstance(inst.id, { sshStatus: 'connecting' });
                window.electronAPI.sshConnect({terminalInstanceId: inst.id, details: inst.sshConnectionArgs});
            }
        });
    }
  }, [tabs.length, terminalInstances.size, createNewTerminalInstance, createNewTerminalPane, appUnlocked, updateTerminalInstance]);

  const checkMasterKeyAndLockStatus = useCallback(async () => { /* ... as before ... */
    if (!window.electronAPI) { setTimeout(checkMasterKeyAndLockStatus, 100); return; }
    const isSet = await window.electronAPI.isMasterKeySet();
    if (isSet) {
      setAppUnlocked(true); setIsMasterPasswordModalOpen(false);
      if (tabs.length === 0 && !isDetachedWindow) { handleAddTab(); }
      else if (isDetachedWindow && tabs.length > 0 && appUnlocked) {
          tabs.forEach(tab => const_collectTerminalIds(tab.rootPane).forEach(termId => {
              const instance = terminalInstances.get(termId);
              if (instance?.sshConnectionArgs && instance.sshStatus === 'disconnected') {
                  updateTerminalInstance(instance.id, { sshStatus: 'connecting' });
                  window.electronAPI.sshConnect({terminalInstanceId: instance.id, details: instance.sshConnectionArgs});
              }
          }));
      }
    } else {
      setAppUnlocked(false);
      const keytarStatus = await window.electronAPI.checkKeytarStatus();
      setKeytarAvailable(keytarStatus === 'available');
      setIsSettingNewPasswordDialog(keytarStatus !== 'available');
      setMasterPasswordMessage(keytarStatus === 'available' ? "Enter master password..." : "Enter master password (keychain N/A)...");
      setIsMasterPasswordModalOpen(true);
    }
  }, [tabs, isDetachedWindow, handleAddTab, terminalInstances, updateTerminalInstance, appUnlocked]);

  useEffect(() => { /* ... Detached Window Init ... */
    if (getQueryParam('isDetached') === 'true') {
      setIsDetachedWindow(true); setIsSidebarOpen(false);
      if (window.electronAPI?.onWindowReadyForDetachedData) {
        const unsub = window.electronAPI.onWindowReadyForDetachedData((initialTabData) => {
          if (initialTabData) handleAddTab(undefined, initialTabData);
        }); return unsub;
      }
    } else {
      setIsDetachedWindow(false); checkMasterKeyAndLockStatus();
    }
  }, [handleAddTab, checkMasterKeyAndLockStatus]);

  const handleMasterPasswordSubmit = async (password: string): Promise<SetMasterKeyResult> => { /* ... as before ... */
    const result = await window.electronAPI.setMasterKeyFromPassword(password, keytarAvailable ?? false);
    if (result.success) {
      const isNowSet = await window.electronAPI.isMasterKeySet();
      if (isNowSet) { setAppUnlocked(true); setIsMasterPasswordModalOpen(false); checkMasterKeyAndLockStatus(); }
      else { setAppUnlocked(false); }
    } else { setAppUnlocked(false); }
    return result;
  };
  const handleAppLock = useCallback(async () => { /* ... as before ... */ }, [tabs, terminalInstances, checkMasterKeyAndLockStatus]);
  const handleSelectTab = (tabId: string) => { setActiveTabId(tabId); /* Fit will be triggered by useEffect on activeTabId */ };
  const_collectTerminalIds = (pane: PaneData): string[] => { /* ... as before ... */
    if (pane.type === 'terminal' && pane.terminalInstanceId) return [pane.terminalInstanceId];
    if (pane.type === 'split' && pane.children) return pane.children.flatMap(const_collectTerminalIds);
    return [];
  };
  const handleCloseTab = useCallback((tabIdToClose: string) => { /* ... as before ... */ }, [tabs, activeTabId, terminalInstances, isDetachedWindow, handleAddTab]);

  const setActivePaneInTab = useCallback((tabId: string, terminalInstanceId: string) => {
    setTabs(prevTabs => prevTabs.map(t => {
      if (t.id === tabId) {
        const termInst = terminalInstances.get(terminalInstanceId);
        return { ...t, activeTerminalInstanceId: terminalInstanceId, title: termInst?.title || t.title };
      } return t;
    }));
    triggerFitForTerminal(terminalInstanceId); // Trigger fit for newly active pane
  }, [terminalInstances, triggerFitForTerminal]); // Added triggerFitForTerminal

  const _splitPaneRecursive = useCallback((currentPane: PaneData, targetPaneId: string, direction: 'horizontal' | 'vertical', newTerminalPane: PaneData): PaneData => { /* ... as before ... */ }, []);
  const findPaneIdForTerminal = useCallback((pane: PaneData, terminalId: string): string | null => { /* ... as before ... */ }, []);
  const handleSplitPane = useCallback((direction: 'horizontal' | 'vertical') => { /* ... as before ... */
    if (!activeTabId) return;
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (!currentTab || !currentTab.activeTerminalInstanceId) { alert("No active terminal to split."); return; }
    const targetPaneIdToSplit = findPaneIdForTerminal(currentTab.rootPane, currentTab.activeTerminalInstanceId);
    if (!targetPaneIdToSplit) { alert("Could not find the pane to split."); return; }
    const newInstance = createNewTerminalInstance();
    const newPane = createNewTerminalPane(newInstance);
    setTerminalInstances(prev => new Map(prev).set(newInstance.id, newInstance));
    const newRootPane =_splitPaneRecursive(currentTab.rootPane, targetPaneIdToSplit, direction, newPane);
    setTabs(prevTabs => prevTabs.map(t => {
        if (t.id === activeTabId) {
            return { ...t, rootPane: newRootPane, activeTerminalInstanceId: newInstance.id };
        } return t;
    }));
    triggerFitForTerminal(newInstance.id);
  }, [activeTabId, tabs, findPaneIdForTerminal, createNewTerminalPane, _splitPaneRecursive, terminalInstances, triggerFitForTerminal]); // Added triggerFitForTerminal

  const handleDetachTab = (tabIdToDetach: string) => { /* ... as before ... */ };

  useEffect(() => { // When activeTabId changes, or sidebar toggles (which affects layout) trigger fit
    if (activeTabId) {
      const currentTab = tabs.find(t => t.id === activeTabId);
      if (currentTab && currentTab.activeTerminalInstanceId) {
        triggerFitForTerminal(currentTab.activeTerminalInstanceId);
      }
    }
  }, [activeTabId, isSidebarOpen, tabs, triggerFitForTerminal]); // Added isSidebarOpen and tabs

  useEffect(() => { /* SSH Status and Data listeners - as before */ }, [appUnlocked, updateTerminalInstance, terminalInstances]);
  const handleTerminalDataInput = useCallback((terminalInstanceId: string, data: string) => { /* ... */ }, [appUnlocked, terminalInstances]);
  const handleTerminalResize = useCallback((terminalInstanceId: string, cols: number, rows: number, height: number, width: number) => { /* ... */ }, [appUnlocked, terminalInstances]);
  const getBufferForTerminal = useCallback((terminalInstanceId: string): string | undefined => { /* ... */ }, [terminalWriteData]);
  const connectAdHocToActive = () => { /* ... as before ... */ };
  const connectFromSessionToActive = (session: SessionProfile) => { /* ... as before ... */ };

  const currentActiveTab = tabs.find(tab => tab.id === activeTabId);
  const currentActiveTerminalInst = currentActiveTab?.activeTerminalInstanceId ? terminalInstances.get(currentActiveTab.activeTerminalInstanceId) : null;

  return ( /* ... JSX structure as before, pass getFitTriggerCount to PaneView ... */
    <div className="App">
      <MasterPasswordModal isOpen={isMasterPasswordModalOpen} onPasswordSubmit={handleMasterPasswordSubmit} message={masterPasswordMessage} isSettingNewPassword={isSettingNewPasswordDialog}/>
      {!isDetachedWindow && <header className="App-header"> {/* ... Header with toggleSidebar ... */}
        <div className="App-header-top">
          <div style={{display:'flex', alignItems:'center'}}>
            {appUnlocked && <button onClick={toggleSidebar} title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"} className="sidebar-toggle-btn">{isSidebarOpen ? "<<" : ">>"}</button>}
            <h1>Terminus Prime</h1>
          </div>
          {/* ... other header content ... */}
        </div>
        {/* ... ad-hoc controls ... */}
      </header>}

      {appUnlocked && !isDetachedWindow && <TabBar tabs={tabs} activeTabId={activeTabId} onSelectTab={handleSelectTab} onCloseTab={handleCloseTab} onAddTab={() => handleAddTab()} onDetachTab={handleDetachTab} />}

      <div className="App-body">
        {appUnlocked && !isDetachedWindow && ( <aside className={`sidebar ${isSidebarOpen ? "open" : "closed"}`} > {/* ... Sidebar ... */} </aside> )}
        <main className="App-content" style={isDetachedWindow && !isSidebarOpen ? {width: '100vw', borderLeft:'none'} : (isDetachedWindow ? {borderLeft:'none'} : {}) }>
          {appUnlocked && currentActiveTab ? (
            <PaneView
              key={currentActiveTab.id + currentActiveTab.rootPane.id}
              pane={currentActiveTab.rootPane}
              terminalInstances={terminalInstances}
              onTerminalData={handleTerminalDataInput}
              onTerminalResize={handleTerminalResize}
              getTerminalDataToDisplay={getBufferForTerminal}
              getTriggerFitCount={getFitTriggerCount} // Pass the getter
              isActivePane={(termId) => termId === currentActiveTab.activeTerminalInstanceId}
              onPaneClick={(_paneId, termId) => termId && setActivePaneInTab(currentActiveTab.id, termId)}
            />
          ) : ( /* Placeholder */ <div className="App-content-placeholder"> {appUnlocked ? (tabs.length > 0 ? "Select a tab." : "Click '+' to open a tab.") : "Application is Locked."}</div> )}
        </main>
      </div>
    </div>
  );
}
export default App;
