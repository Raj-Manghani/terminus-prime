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
  session: SessionProfile | null;
}

const TerminalView: React.FC<TerminalViewProps> = ({ session }) => {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const [isConnected, setIsConnected] = useState(false); // State for potential UI changes
  const isConnectedRef = useRef(false); // Ref to track current connection status for callbacks
  const termInstance = useRef<Terminal | null>(null);
  const fitAddonInstance = useRef(new FitAddon());
  const searchAddonInstance = useRef(new SearchAddon());
  const webglAddonInstance = useRef<WebglAddon | null>(null);
  const lastSessionKeyRef = useRef<string>(''); // Keep track of the connected session

  // Effect for initializing the terminal instance and setting up listeners (runs once on mount)
  useEffect(() => {
    console.log("TerminalView: Mount/Init Effect Running");
    let term: Terminal | null = null;
    let dataListenerDisposable: { dispose: () => void } | null = null;
    let resizeListenerDisposable: { dispose: () => void } | null = null;

    // Define handlers here so they can be used in removeListener
    const handleIncomingData = (event: any, data: string) => {
      // console.log("IPC: terminal-incoming-data", data); // Reduce noise
      termInstance.current?.write(data); // Use ref instance
    };
    const handleStatusUpdate = (event: any, { status, message }: { status: string, message: string }) => {
      console.log(`IPC: terminal-status: ${status} - ${message}`);
      const connected = status === 'connected';
      setIsConnected(connected); // Update state for UI
      isConnectedRef.current = connected; // Update ref for callbacks
      termInstance.current?.writeln(`\x1b[33m[STATUS: ${status}] ${message}\x1b[0m`); // Use ref instance
    };

    if (terminalRef.current && !termInstance.current) {
      console.log("Initializing xterm...");
      try {
        term = new Terminal({
          cursorBlink: true,
          convertEol: true,
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#d4d4d4',
          }
        });
        console.log("Terminal instance created.");
        termInstance.current = term; // Assign to ref immediately
        console.log("termInstance.current assigned.");

        // Load addons
        term.loadAddon(fitAddonInstance.current);
        term.loadAddon(searchAddonInstance.current);
        console.log("Addons loaded.");

        // Open the terminal
        term.open(terminalRef.current);
        console.log("Terminal opened in DOM.");

        // Wait a frame before fitting
        requestAnimationFrame(() => {
          try {
            fitAddonInstance.current.fit();
            console.log("Terminal fitted successfully");
          } catch (e) {
            console.error("Error fitting terminal:", e);
          }
        });

        term.writeln('Welcome to Terminus Prime!');
        term.writeln('Select a session from the sidebar to connect.');

        // --- IPC Communication Setup ---
        console.log("Setting up IPC listeners...");
        ipcRenderer.on('terminal-incoming-data', handleIncomingData);
        ipcRenderer.on('terminal-status', handleStatusUpdate);
        console.log("IPC listeners set up.");

        dataListenerDisposable = term.onData((data) => {
          // Check the ref for the current connection status
          if (isConnectedRef.current) {
            ipcRenderer.send('terminal-data', data);
          } else {
            console.log(`Terminal onData: isConnectedRef=${isConnectedRef.current}, data=${JSON.stringify(data)}`);
            console.log('Terminal Data (not sent - disconnected):', data);
            term?.write(data); // Echo locally if not connected
          }
        });

        resizeListenerDisposable = term.onResize(({ cols, rows }) => {
          // Send resize only if connected
          if (isConnectedRef.current) {
             ipcRenderer.send('terminal-resize', { cols, rows });
             console.log('Terminal Resize (sent):', { cols, rows });
          } else {
             console.log('Terminal Resize (not sent - disconnected):', { cols, rows });
          }
        });

        // Focus
        term.focus();
        console.log("Terminal focused.");

      } catch (e) {
        console.error("Error during xterm initialization:", e);
      }
    } else {
        console.log("Initialization skipped: terminalRef.current=", terminalRef.current, "termInstance.current=", termInstance.current);
    }

    // Handle window resize
    const handleWindowResize = () => {
      if (termInstance.current) {
        try {
          fitAddonInstance.current.fit();
        } catch (e) {
          console.error("Error fitting terminal on window resize:", e);
        }
      }
    };
    window.addEventListener('resize', handleWindowResize);

    // Cleanup function for this effect
    return () => {
      console.log("Cleaning up TerminalView Init/Listeners Effect...");
      ipcRenderer.removeListener('terminal-incoming-data', handleIncomingData);
      ipcRenderer.removeListener('terminal-status', handleStatusUpdate);
      dataListenerDisposable?.dispose();
      resizeListenerDisposable?.dispose();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []); // Empty dependency array: Run only once on mount

  // Effect specifically for handling session changes
  useEffect(() => {
    console.log("TerminalView: Session Effect Running. Current session:", session);
    const term = termInstance.current; // Get current terminal instance

    if (term) { // Only proceed if terminal instance exists
      console.log("Session Effect: Terminal instance exists.");
      if (session && session.host && session.username && session.password) {
        const newSessionKey = `${session.host}:${session.port}:${session.username}`;
        if (newSessionKey !== lastSessionKeyRef.current) {
          console.log(`Connecting to new session: ${newSessionKey}`);
          term.clear();
          term.writeln(
            `Connecting to ${session.username}@${session.host}:${session.port || 22}...`
          );
          ipcRenderer.send('terminal-connect', {
            host: session.host,
            port: session.port,
            username: session.username,
            password: session.password,
          });
          lastSessionKeyRef.current = newSessionKey;
        } else {
          console.log("Session key hasn't changed, not reconnecting.");
        }
      } else if (lastSessionKeyRef.current !== '') {
        // Session became null or invalid, but we were connected
        console.log('Disconnecting from session:', lastSessionKeyRef.current);
        term.clear();
        term.writeln('Disconnected. Select a session to connect.');
        lastSessionKeyRef.current = '';
        setIsConnected(false); // Ensure connection state is reset
        isConnectedRef.current = false; // Reset ref as well
      }
    } else {
      console.log("Session Effect: Terminal instance does NOT exist yet.");
    }
  }, [session]); // Depend only on the session prop

  // Effect for terminal disposal on unmount
  useEffect(() => {
    return () => {
      console.log("Unmounting TerminalView component...");
      termInstance.current?.dispose();
      termInstance.current = null;
      console.log("TerminalView component unmounted and terminal disposed.");
    };
  }, []); // Empty dependency array means this runs only on unmount

  return (
    <div
      ref={terminalRef}
      style={{
        height: '100%',
        width: '100%',
        backgroundColor: '#1e1e1e',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}
    />
  );
};

export default TerminalView;
