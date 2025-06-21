import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import TerminalView from './components/TerminalView'; // Corrected path
import MasterPasswordModal from './components/MasterPasswordModal';
import SessionListView from './components/SessionListView';
import TabBar from './components/TabBar';
import PaneView from './components/PaneView';
import type { SessionProfile, SshConnectionDetails as PreloadSshDetails, TabDataFromRenderer, TerminalInstance, PaneData as PreloadPaneData, SetMasterKeyResult } from '../../preload'; // Added SetMasterKeyResult
import './App.css';
import 'allotment/dist/style.css';

export type { TerminalInstance } from '../../preload';
export interface PaneData extends PreloadPaneData {}
export interface AppTabData extends Omit<TabDataFromRenderer, 'containedTerminalInstances' | 'rootPane'> {
  rootPane: PaneData;
  // containedTerminalInstances is part of TabDataFromRenderer, not directly stored in AppTabData here
  // It's constructed on-the-fly for detach.
}

const getQueryParam = (param: string): string | null => new URLSearchParams(window.location.search).get(param);

const App: React.FC = () => {
  const [isDetachedWindow, setIsDetachedWindow] = useState(false);
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

  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

  const createNewTerminalInstance = useCallback((sshArgs?: PreloadSshDetails, title?: string): TerminalInstance => {
    const termId = uuidv4();
    return { id: termId, sshConnectionArgs: sshArgs, sshStatus: 'disconnected', title: title || `Terminal ${terminalInstances.size + 1}`};
  }, [terminalInstances.size]);

  const createNewTerminalPane = useCallback((instance: TerminalInstance): PaneData => {
    return { id: uuidv4(), type: 'terminal', terminalInstanceId: instance.id, size: '100%' };
  }, []);

  const updateTerminalInstance = useCallback((terminalInstanceId: string, updates: Partial<TerminalInstance>) => {
    setTerminalInstances(prevMap => {
        const current = prevMap.get(terminalInstanceId);
        if (!current) { console.warn(`updateTerminalInstance: instance ${terminalInstanceId} not found.`); return prevMap; }
        const updatedInstance = { ...current, ...updates };
        const newMap = new Map(prevMap).set(terminalInstanceId, updatedInstance);
        setTabs(prevTabs => prevTabs.map(tab => {
            if (const_collectTerminalIds(tab.rootPane).includes(terminalInstanceId) && tab.activeTerminalInstanceId === terminalInstanceId) {
                return { ...tab, title: updatedInstance.title };
            } return tab;
        }));
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
        initialInstancesToAdd = isDetachedTabData.containedTerminalInstances.map(inst => ({...inst, sshStatus: 'disconnected'}));
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
    setActiveTabId(newTabId);

    if (sessionToConnect && !isDetachedTabData && initialInstancesToAdd[0]?.sshConnectionArgs) {
      updateTerminalInstance(initialInstancesToAdd[0].id, { sshStatus: 'connecting' });
      window.electronAPI.sshConnect({ terminalInstanceId: initialInstancesToAdd[0].id, details: initialInstancesToAdd[0].sshConnectionArgs });
    } else if (isDetachedTabData && appUnlocked) { // appUnlocked check added
        initialInstancesToAdd.forEach(inst => {
            if (inst.sshConnectionArgs) {
                updateTerminalInstance(inst.id, { sshStatus: 'connecting' });
                window.electronAPI.sshConnect({terminalInstanceId: inst.id, details: inst.sshConnectionArgs});
            }
        });
    }
  }, [tabs.length, terminalInstances.size, createNewTerminalInstance, createNewTerminalPane, appUnlocked, updateTerminalInstance]);

  const checkMasterKeyAndLockStatus = useCallback(async () => {
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
      const isKeytarFunc = keytarStatus === 'available';
      setKeytarAvailable(isKeytarFunc);
      setIsSettingNewPasswordDialog(!isKeytarFunc);
      setMasterPasswordMessage(isKeytarFunc ? "Enter master password..." : "Enter master password (keychain N/A)...");
      setIsMasterPasswordModalOpen(true);
    }
  }, [tabs, isDetachedWindow, handleAddTab, terminalInstances, updateTerminalInstance, appUnlocked]);

  useEffect(() => {
    if (getQueryParam('isDetached') === 'true') {
      setIsDetachedWindow(true); setIsSidebarOpen(false);
      if (window.electronAPI?.onWindowReadyForDetachedData) {
        const unsub = window.electronAPI.onWindowReadyForDetachedData((initialTabData) => {
          if (initialTabData) handleAddTab(undefined, initialTabData);
        }); return unsub;
      }
    } else {
      setIsDetachedWindow(false);
      checkMasterKeyAndLockStatus();
    }
  }, [handleAddTab, checkMasterKeyAndLockStatus]); // Dependencies for initial setup

  const handleMasterPasswordSubmit = async (password: string): Promise<SetMasterKeyResult> => {
    const result = await window.electronAPI.setMasterKeyFromPassword(password, keytarAvailable ?? false);
    if (result.success) {
      const isNowSet = await window.electronAPI.isMasterKeySet();
      if (isNowSet) { setAppUnlocked(true); setIsMasterPasswordModalOpen(false); checkMasterKeyAndLockStatus(); }
      else { setAppUnlocked(false); }
    } else { setAppUnlocked(false); }
    return result;
  };
  const handleAppLock = useCallback(async () => {
    if (window.electronAPI) await window.electronAPI.clearMasterKey();
    setAppUnlocked(false);
    tabs.forEach(tab => const_collectTerminalIds(tab.rootPane).forEach(termId => {
        const instance = terminalInstances.get(termId);
        if (instance && (instance.sshStatus === 'connected' || instance.sshStatus === 'connecting')) {
            window.electronAPI.sshDisconnect({terminalInstanceId: termId});
        }
    }));
    checkMasterKeyAndLockStatus();
  }, [tabs, terminalInstances, checkMasterKeyAndLockStatus]);

  const handleSelectTab = (tabId: string) => { setActiveTabId(tabId); };

  const_collectTerminalIds = (pane: PaneData): string[] => {
    if (pane.type === 'terminal' && pane.terminalInstanceId) return [pane.terminalInstanceId];
    if (pane.type === 'split' && pane.children) return pane.children.flatMap(const_collectTerminalIds);
    return [];
  };

  const handleCloseTab = useCallback((tabIdToClose: string) => {
    if (isDetachedWindow && tabs.length === 1 && tabs[0].id === tabIdToClose) { window.close(); return; }
    const tabToClose = tabs.find(t => t.id === tabIdToClose);
    if (tabToClose) { const_collectTerminalIds(tabToClose.rootPane).forEach(termId => {
        const instance = terminalInstances.get(termId);
        if (instance && (instance.sshStatus === 'connected' || instance.sshStatus === 'connecting')) {
            window.electronAPI.sshDisconnect({ terminalInstanceId: termId });
        }
        setTerminalInstances(prev => { const m = new Map(prev); m.delete(termId); return m; });
    });}
    setTabs(prevTabs => {
      const newTabs = prevTabs.filter(tab => tab.id !== tabIdToClose);
      if (activeTabId === tabIdToClose) {
        if (newTabs.length > 0) { setActiveTabId(newTabs[Math.max(0, prevTabs.findIndex(t=>t.id===tabIdToClose)-1)].id); }
        else { setActiveTabId(null); if (!isDetachedWindow) { setTimeout(() => handleAddTab(), 0); } }
      } return newTabs;
    });
  }, [tabs, activeTabId, terminalInstances, isDetachedWindow, handleAddTab]);

  const setActivePaneInTab = useCallback((tabId: string, terminalInstanceId: string) => {
    setTabs(prevTabs => prevTabs.map(t => {
      if (t.id === tabId) {
        const termInst = terminalInstances.get(terminalInstanceId);
        return { ...t, activeTerminalInstanceId: terminalInstanceId, title: termInst?.title || t.title };
      } return t;
    }));
  }, [terminalInstances]);

  const _splitPaneRecursive = useCallback((currentPane: PaneData, targetPaneIdToSplit: string, direction: 'horizontal' | 'vertical', newTerminalPane: PaneData): PaneData => {
    if (currentPane.id === targetPaneIdToSplit) {
      if (currentPane.type !== 'terminal') return currentPane;
      return { id: uuidv4(), type: 'split', direction, children: [ { ...currentPane, size: '50%', id: uuidv4() }, { ...newTerminalPane, size: '50%' } ] };
    }
    if (currentPane.type === 'split' && currentPane.children) {
      return { ...currentPane, children: currentPane.children.map(child => _splitPaneRecursive(child, targetPaneIdToSplit, direction, newTerminalPane)) };
    } return currentPane;
  }, []);
  const findPaneIdForTerminal = useCallback((pane: PaneData, terminalId: string): string | null => {
    if (pane.type === 'terminal' && pane.terminalInstanceId === terminalId) return pane.id;
    if (pane.type === 'split' && pane.children) {
      for (const child of pane.children) { const foundId = findPaneIdForTerminal(child, terminalId); if (foundId) return foundId; }
    } return null;
  }, []);
  const handleSplitPane = useCallback((direction: 'horizontal' | 'vertical') => {
    if (!activeTabId) return;
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (!currentTab || !currentTab.activeTerminalInstanceId) { alert("No active terminal to split."); return; }
    const targetPaneId = findPaneIdForTerminal(currentTab.rootPane, currentTab.activeTerminalInstanceId);
    if (!targetPaneId) { alert("Could not find the pane to split."); return; }
    const newInstance = createNewTerminalInstance();
    const newPane = createNewTerminalPane(newInstance);
    setTerminalInstances(prev => new Map(prev).set(newInstance.id, newInstance));
    const newRootPane = _splitPaneRecursive(currentTab.rootPane, targetPaneId, direction, newPane);
    setTabs(prevTabs => prevTabs.map(t => t.id === activeTabId ? { ...t, rootPane: newRootPane, activeTerminalInstanceId: newInstance.id } : t));
  }, [activeTabId, tabs, findPaneIdForTerminal, createNewTerminalInstance, createNewTerminalPane, _splitPaneRecursive]);

  const handleDetachTab = (tabIdToDetach: string) => {
    const tabData = tabs.find(t => t.id === tabIdToDetach);
    if (tabData && window.electronAPI && !isDetachedWindow) {
        const termIdsInTab = const_collectTerminalIds(tabData.rootPane);
        const containedTerminalInstances = termIdsInTab.map(tid => terminalInstances.get(tid)).filter(Boolean) as TerminalInstance[];
        const snapshot: TabDataFromRenderer = {
            id: tabData.id, title: tabData.title, rootPane: tabData.rootPane,
            activeTerminalInstanceId: tabData.activeTerminalInstanceId,
            containedTerminalInstances
        };
        window.electronAPI.requestDetachTab(snapshot);
        handleCloseTab(tabIdToDetach); // Close tab in original window
    }
  };

  useEffect(() => {
    if (!appUnlocked || !window.electronAPI?.onSshStatus) return;
    const unsubStatus = window.electronAPI.onSshStatus((event: SshStatusIPCArgs) => {
        const inst = terminalInstances.get(event.terminalInstanceId);
        if(inst) {
            const newTitle = (event.status === 'connected' && inst.sshConnectionArgs) ? `${inst.sshConnectionArgs.username}@${inst.sshConnectionArgs.host}` : (event.status === 'error' || event.status === 'disconnected' ? `Terminal ${[...terminalInstances.keys()].indexOf(event.terminalInstanceId) + 1}` : event.message.substring(0,30));
            updateTerminalInstance(event.terminalInstanceId, { sshStatus: event.status, title: newTitle });
            if (event.status === 'error' || event.status === 'disconnected') {
                setTerminalWriteData({terminalInstanceId: event.terminalInstanceId, data: `\r\n[SSH: ${event.status}] ${event.message}\r\n${event.status !== 'connecting' ? '$ ' : ''}`});
            }
        }
    });
    const unsubData = window.electronAPI.onSshData((event: SshDataIPCArgs) => { setTerminalWriteData({ terminalInstanceId: event.terminalInstanceId, data: event.data }); });
    return () => { unsubStatus(); unsubData(); };
  }, [appUnlocked, terminalInstances, updateTerminalInstance]);

  const handleTerminalDataInput = useCallback((terminalInstanceId: string, data: string) => {
    const instance = terminalInstances.get(terminalInstanceId);
    if (appUnlocked && instance && instance.sshStatus === 'connected') window.electronAPI.sshSendData({ terminalInstanceId, data });
  }, [appUnlocked, terminalInstances]);
  const handleTerminalResize = useCallback((terminalInstanceId: string, cols: number, rows: number, height: number, width: number) => {
    if (appUnlocked && terminalInstances.has(terminalInstanceId)) window.electronAPI.sshResize({ terminalInstanceId, cols, rows, height, width });
  }, [appUnlocked, terminalInstances]);
  const getBufferForTerminal = useCallback((terminalInstanceId: string): string | undefined => {
    if (terminalWriteData?.terminalInstanceId === terminalInstanceId) { const data = terminalWriteData.data; setTerminalWriteData(null); return data; } return undefined;
  }, [terminalWriteData]);
  const getClearTriggerForTerminal = useCallback((terminalInstanceId: string): number | undefined => {
    if (terminalClearTrigger?.terminalInstanceId === terminalInstanceId) return terminalClearTrigger.trigger; return undefined;
  }, [terminalClearTrigger]);
  const connectAdHocToActive = () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || !activeTab.activeTerminalInstanceId) { alert("No active pane."); return; }
    const details: PreloadSshDetails = { host: formHost, port: Number(formPort), username: formUsername, password: formPassword };
    updateTerminalInstance(activeTab.activeTerminalInstanceId, { sshConnectionArgs: details, sshStatus: 'connecting', title: 'Connecting...' });
    window.electronAPI.sshConnect({ terminalInstanceId: activeTab.activeTerminalInstanceId, details });
  };
  const connectFromSessionToActive = (session: SessionProfile) => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    const details: PreloadSshDetails = { host: session.host, port: session.port, username: session.username, password: session.password };
    if (activeTab && activeTab.activeTerminalInstanceId) {
      setFormHost(session.host); setFormPort(session.port.toString()); setFormUsername(session.username); setFormPassword(session.password || '');
      updateTerminalInstance(activeTab.activeTerminalInstanceId, { sshConnectionArgs: details, sshStatus: 'connecting', title: `Connecting to ${session.name}`});
      window.electronAPI.sshConnect({ terminalInstanceId: activeTab.activeTerminalInstanceId, details });
    } else { handleAddTab(session); }
  };

  const currentActiveTab = tabs.find(tab => tab.id === activeTabId);
  const currentActiveTerminalInst = currentActiveTab?.activeTerminalInstanceId ? terminalInstances.get(currentActiveTab.activeTerminalInstanceId) : null;

  return (
    <div className="App">
      <MasterPasswordModal isOpen={isMasterPasswordModalOpen} onPasswordSubmit={handleMasterPasswordSubmit} message={masterPasswordMessage} isSettingNewPassword={isSettingNewPasswordDialog}/>
      {!isDetachedWindow && <header className="App-header">
        <div className="App-header-top">
          <div style={{display:'flex', alignItems:'center'}}>
            {appUnlocked && <button onClick={toggleSidebar} title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"} className="sidebar-toggle-btn">{isSidebarOpen ? "<<" : ">>"}</button>}
            <h1>Terminus Prime</h1>
          </div>
          <div className="App-header-status">
            {appUnlocked && currentActiveTerminalInst && <small>Pane: {currentActiveTerminalInst.title} ({currentActiveTerminalInst.sshStatus})</small>}
            {appUnlocked && <button onClick={handleAppLock} title="Lock App">Lock</button>}
          </div>
        </div>
        {appUnlocked && ( <div className="App-header-controls">
            <input value={formHost} onChange={e => setFormHost(e.target.value)} placeholder="Host" />
            <input type="number" value={formPort} onChange={e => setFormPort(e.target.value)} placeholder="Port" />
            <input value={formUsername} onChange={e => setFormUsername(e.target.value)} placeholder="Username" />
            <input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} placeholder="Password" />
            <button onClick={connectAdHocToActive} disabled={!currentActiveTerminalInst}>Connect</button>
            <button onClick={() => currentActiveTerminalInst && window.electronAPI.sshDisconnect({terminalInstanceId: currentActiveTerminalInst.id})} disabled={!currentActiveTerminalInst || currentActiveTerminalInst.sshStatus !== 'connected'}>Disconnect</button>
            <button onClick={() => handleSplitPane('vertical')} disabled={!currentActiveTerminalInst}>Split V</button>
            <button onClick={() => handleSplitPane('horizontal')} disabled={!currentActiveTerminalInst}>Split H</button>
        </div>)}
      </header>}

      {appUnlocked && <TabBar tabs={tabs} activeTabId={activeTabId} onSelectTab={handleSelectTab} onCloseTab={handleCloseTab} onAddTab={() => handleAddTab()} onDetachTab={isDetachedWindow ? undefined : handleDetachTab} />}

      <div className="App-body">
        {appUnlocked && !isDetachedWindow && (
          <aside className={`sidebar ${isSidebarOpen ? "open" : "closed"}`}>
            <SessionListView appUnlocked={appUnlocked} currentConnectionDetails={{ host: formHost, port: formPort, username: formUsername, password: formPassword }} onConnectSession={connectFromSessionToActive} />
          </aside>
        )}
        <main className="App-content" style={isDetachedWindow && !isSidebarOpen ? {width: '100vw', borderLeft:'none'} : (isDetachedWindow ? {borderLeft:'none'} : {}) }>
          {appUnlocked && currentActiveTab ? (
            <PaneView key={currentActiveTab.id + currentActiveTab.rootPane.id} pane={currentActiveTab.rootPane} terminalInstances={terminalInstances}
              onTerminalData={handleTerminalDataInput} onTerminalResize={handleTerminalResize}
              getTerminalDataToDisplay={getBufferForTerminal} getTerminalClearTrigger={(id) => terminalClearTrigger?.terminalInstanceId === id ? terminalClearTrigger.trigger : undefined}
              isActivePane={(termId) => termId === currentActiveTab.activeTerminalInstanceId}
              onPaneClick={(_paneId, termId) => termId && setActivePaneInTab(currentActiveTab.id, termId)} />
          ) : ( <div className="App-content-placeholder"> {appUnlocked ? (tabs.length > 0 ? "Select a tab." : "Click '+' to open a tab.") : "Application is Locked."}</div> )}
        </main>
      </div>
    </div>
  );
}
export default App;
