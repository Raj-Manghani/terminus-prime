import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { WebglAddon } from 'xterm-addon-webgl';
import 'xterm/css/xterm.css'; // Import xterm CSS

// Use require directly now that nodeIntegration is enabled
const { ipcRenderer } = require('electron');

import { SessionProfile } from './SessionManager';

interface TerminalViewProps {
  tabId: string; // Add tabId prop
  session: SessionProfile | null;
  // isConnected and reconnectTrigger props removed
}

const TerminalView: React.FC<TerminalViewProps> = ({ tabId, session }) => { // Destructure tabId
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const isConnectedRef = useRef(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const termInstance = useRef<Terminal | null>(null);
  const fitAddonInstance = useRef(new FitAddon());
  const searchAddonInstance = useRef(new SearchAddon());
  const webglAddonInstance = useRef<WebglAddon | null>(null);
  const lastSessionKeyRef = useRef<string>('');

  // --- Effect 1: Window Resize Listener & Final Unmount Cleanup ---
  useEffect(() => {
    console.log(`[${tabId}] TerminalView Mount/Init Effect Running (Resize Listener & Final Cleanup)...`);

    const handleWindowResize = () => {
        if (termInstance.current && terminalRef.current) {
            try {
                fitAddonInstance.current.fit();
            } catch (e) {
                console.error("Error fitting terminal on window resize:", e);
            }
        }
    };
    window.addEventListener('resize', handleWindowResize);

    // Cleanup function for this effect (runs only on component unmount)
    return () => {
        console.log(`[${tabId}] Cleaning up TerminalView Mount/Init Effect (Resize Listener & Instance)...`);
        window.removeEventListener('resize', handleWindowResize);
        // Dispose terminal instance if it exists (final cleanup)
        if (termInstance.current) {
            console.log(`[${tabId}] Disposing terminal instance on unmount...`);
            termInstance.current.dispose();
            termInstance.current = null;
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once on mount and cleans up on unmount

  // --- Effect 2: Session Logic, Terminal Creation, IPC & Term Listeners ---
  useEffect(() => {
    console.log(`[${tabId}] TerminalView: Session/Terminal Effect Running. Session:`, session, "isConnected:", isConnected, "isConnecting:", isConnecting);

    let dataListenerDisposable: { dispose: () => void } | null = null;
    let resizeListenerDisposable: { dispose: () => void } | null = null;
    let termCreatedInThisRun = false;
    let ipcListenersAttached = false; // Track if IPC listeners were attached in this run
    let connectTimeoutId: NodeJS.Timeout | null = null; // Store timeout ID

    // Define IPC handlers within this effect's scope
    const handleIncomingData = (event: any, payload: { tabId: string, data: string }) => {
        if (payload.tabId === tabId && termInstance.current) {
            // console.log(`[${tabId}] handleIncomingData received for writing. termInstance exists:`, !!termInstance.current); // Log receipt
            // Write directly without requestAnimationFrame
            termInstance.current.write(payload.data);
        }
    };
    const handleStatusUpdate = (event: any, payload: { tabId: string, status: string, message: string }) => {
        if (payload.tabId === tabId) {
            console.log(`[${tabId}] IPC: terminal-status: ${payload.status} - ${payload.message}`);
            const connected = payload.status === 'connected';
            setIsConnected(connected);
            isConnectedRef.current = connected;
            setIsConnecting(false);
            termInstance.current?.writeln(`\x1b[33m[STATUS: ${payload.status}] ${payload.message}\x1b[0m`);
            // Try writing an empty string to potentially force a refresh after connection
            if (connected && termInstance.current) {
                 console.log(`[${tabId}] Writing empty string after connected status.`);
                 termInstance.current.write('');
            }
        }
    };

     // --- Terminal Creation ---
     if (session && terminalRef.current && !termInstance.current) {
        console.log(`[${tabId}] Initializing xterm...`);
        try {
          const term = new Terminal({
            cursorBlink: true,
            convertEol: true,
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 14,
            theme: { background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#d4d4d4' }
          });
          termInstance.current = term;
          termCreatedInThisRun = true;
          console.log(`[${tabId}] Terminal instance created and assigned.`);

          term.loadAddon(fitAddonInstance.current);
          term.loadAddon(searchAddonInstance.current);
          console.log(`[${tabId}] Addons loaded.`);

          term.open(terminalRef.current);
          console.log(`[${tabId}] Terminal opened in DOM.`);

          requestAnimationFrame(() => {
            try {
              fitAddonInstance.current.fit();
              console.log(`[${tabId}] Terminal fitted successfully`);
            } catch (e) { console.error(`[${tabId}] Error fitting terminal:`, e); }
          });

          // Setup term listeners
          dataListenerDisposable = term.onData((data) => {
            ipcRenderer.send('terminal-data', { tabId, data });
          });
          resizeListenerDisposable = term.onResize(({ cols, rows }) => {
            if (isConnectedRef.current) {
              ipcRenderer.send('terminal-resize', { tabId, size: { cols, rows } });
            } else {
               console.log(`[${tabId}] Terminal Resize (not sent - disconnected):`, { cols, rows });
            }
          });

          // Setup IPC listeners *after* term is created and assigned
          console.log(`[${tabId}] Setting up IPC listeners for active terminal...`);
          ipcRenderer.on('terminal-incoming-data', handleIncomingData);
          ipcRenderer.on('terminal-status', handleStatusUpdate);
          ipcListenersAttached = true; // Mark as attached

          term.focus();
          console.log(`[${tabId}] Terminal focused.`);

        } catch (e) {
          console.error(`[${tabId}] Error during xterm initialization:`, e);
          termInstance.current = null;
        }
     }
     // --- End Terminal Creation ---

    // --- Connection Logic ---
    const term = termInstance.current;
    let shouldConnect = false;

    if (term && session && session.host && session.username && session.password) {
        const newSessionKey = `${session.host}:${session.port}:${session.username}`;
        if ((newSessionKey !== lastSessionKeyRef.current) || (!isConnected && !isConnecting)) {
          console.log(`[${tabId}] Connecting to session: ${newSessionKey}. Reason: ${newSessionKey !== lastSessionKeyRef.current ? 'Session changed' : 'Disconnected'}`);
          shouldConnect = true;
        } else if (isConnecting) {
          console.log(`[${tabId}] Connection attempt already in progress.`);
        } else {
          console.log(`[${tabId}] Session key hasn't changed and still connected, not reconnecting.`);
        }
    } else if (term && lastSessionKeyRef.current !== '' && !session) {
        console.log(`[${tabId}] Session became null. Clearing terminal and resetting state.`);
        term.clear();
        lastSessionKeyRef.current = '';
        if (isConnected || isConnecting) {
            setIsConnected(false);
            isConnectedRef.current = false;
            setIsConnecting(false);
        }
    } else {
        console.log(`[${tabId}] Session Connection Effect: No connection action needed (terminal not ready, no session, or already connected/connecting).`);
    }

    if (shouldConnect && term && session && session.host && session.username && session.password) {
        // Delay the connection attempt slightly
        connectTimeoutId = setTimeout(() => {
            console.log(`[${tabId}] Connecting to session (after delay): ${session.username}@${session.host}:${session.port || 22}...`);
            setIsConnecting(true);
            term.clear(); // Clear the terminal *before* sending connect request
            term.writeln(`Connecting to ${session.username}@${session.host}:${session.port || 22}...`); // Show connecting message
            ipcRenderer.send('terminal-connect', { // Send connect request *after* clearing
              tabId,
              config: {
                host: session.host,
                port: session.port,
                username: session.username,
                password: session.password,
              }
            });
            lastSessionKeyRef.current = `${session.host}:${session.port}:${session.username}`;
        }, 50); // 50ms delay - adjust if needed
    }

    // Cleanup for *this* effect
    return () => {
        console.log(`[${tabId}] Cleaning up Session/Terminal Effect...`);
        // Clear connection timeout if it's pending
        if (connectTimeoutId) {
            clearTimeout(connectTimeoutId);
        }
        // Dispose term listeners only if created in this run
        if (termCreatedInThisRun) {
            console.log(`[${tabId}]   Disposing term listeners (created in this run)...`);
            dataListenerDisposable?.dispose();
            resizeListenerDisposable?.dispose();
        }
        // Remove IPC listeners only if they were attached in this run
        if (ipcListenersAttached) {
             console.log(`[${tabId}]   Removing IPC listeners (attached in this run)...`);
             ipcRenderer.removeListener('terminal-incoming-data', handleIncomingData);
             ipcRenderer.removeListener('terminal-status', handleStatusUpdate);
        }
    };

  }, [tabId, session, isConnected, isConnecting]); // Dependencies for session logic

  // --- Conditional Rendering ---
  if (!session) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#aaa', backgroundColor: '#1e1e1e', fontSize: '1.2rem',
        height: '100%', width: '100%',
      }}>
        Select a session from the sidebar or use the '+' button to start.
      </div>
    );
  }

  // Render the terminal container div if there is a session
  return (
    <div
      ref={terminalRef}
      style={{
        height: '100%', width: '100%', backgroundColor: '#1e1e1e',
        position: 'relative', display: 'flex', flexDirection: 'column'
      }}
    />
  );
};

export default TerminalView;
