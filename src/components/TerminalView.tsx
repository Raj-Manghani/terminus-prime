import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { WebglAddon } from 'xterm-addon-webgl';
import 'xterm/css/xterm.css'; // Import xterm CSS

// Use require directly now that nodeIntegration is enabled
const { ipcRenderer } = require('electron');

const TerminalView: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const [isConnected, setIsConnected] = useState(false); // State to track connection
  const termInstance = useRef<Terminal | null>(null);
  const fitAddonInstance = useRef(new FitAddon());
  const searchAddonInstance = useRef(new SearchAddon());
  const webglAddonInstance = useRef<WebglAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [isTerminalReady, setIsTerminalReady] = useState(false);

  // Initialize terminal only after container is ready
  useEffect(() => {
    let term: Terminal | null = null;
    let dataListenerDisposable: { dispose: () => void } | null = null;
    let resizeListenerDisposable: { dispose: () => void } | null = null;

    // Define handlers here so they can be used in removeListener
    const handleIncomingData = (event: any, data: string) => {
      term?.write(data);
    };
    const handleStatusUpdate = (event: any, { status, message }: { status: string, message: string }) => {
      console.log(`Terminal Status: ${status} - ${message}`);
      setIsConnected(status === 'connected'); // Update connection state
      term?.writeln(`\x1b[33m[STATUS: ${status}] ${message}\x1b[0m`);
    };

    // Create a ResizeObserver to detect when the container has dimensions
    if (terminalRef.current && !resizeObserverRef.current) {
      console.log("Setting up ResizeObserver...");

      const observer = new ResizeObserver(entries => {
        const entry = entries[0];
        if (entry && entry.contentRect) {
          const { width, height } = entry.contentRect;
          console.log(`Container dimensions: ${width}x${height}`);

          // Only initialize terminal if container has actual dimensions
          if (width > 0 && height > 0 && !isTerminalReady) {
            setIsTerminalReady(true);
            // ResizeObserver will continue monitoring for size changes
          } else if (isTerminalReady && termInstance.current) {
            // If terminal is already initialized, just fit it to the new size
            try {
              fitAddonInstance.current.fit();
            } catch (e) {
              console.error("Error fitting terminal:", e);
            }
          }
        }
      });

      observer.observe(terminalRef.current);
      resizeObserverRef.current = observer;
    }

    // Initialize terminal when container is ready
    if (terminalRef.current && isTerminalReady && !termInstance.current) {
      console.log("Initializing xterm...");
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
      termInstance.current = term;

      // Load addons
      term.loadAddon(fitAddonInstance.current);
      term.loadAddon(searchAddonInstance.current);

      try {
        // Open the terminal
        term.open(terminalRef.current);

        // Wait a frame before fitting to ensure DOM is updated
        requestAnimationFrame(() => {
          try {
            fitAddonInstance.current.fit();
            console.log("Terminal fitted successfully");
          } catch (e) {
            console.error("Error fitting terminal:", e);
          }
        });

        term.writeln('Welcome to Terminus Prime!');

        // --- IPC Communication Setup ---

        // 1. Listen for incoming data from Main process
        ipcRenderer.on('terminal-incoming-data', handleIncomingData);

        // 2. Listen for status updates from Main process
        ipcRenderer.on('terminal-status', handleStatusUpdate);

        // 3. Handle data (user input)
        dataListenerDisposable = term.onData((data) => {
          if (isConnected) { // Only send data if connected
            ipcRenderer.send('terminal-data', data);
          } else {
            console.log('Terminal Data (not sent - disconnected):', data);
            term?.write(data); // Echo locally if not connected
          }
        });

        // 4. Handle resize events
        resizeListenerDisposable = term.onResize(({ cols, rows }) => {
          ipcRenderer.send('terminal-resize', { cols, rows });
          console.log('Terminal Resize (sent):', { cols, rows });
        });

        // --- Initial Connection (TEMPORARY/INSECURE) ---
        term.writeln('No SSH credentials configured. Please use the session manager to connect.');
        // const connectionConfig = {
        //   host: 'YOUR_SSH_HOST',
        //   port: 22,
        //   username: 'YOUR_USERNAME',
        //   password: 'YOUR_PASSWORD',
        // };
        // if (connectionConfig.host !== 'YOUR_SSH_HOST') {
        //    ipcRenderer.send('terminal-connect', connectionConfig);
        // } else {
        //    term.writeln('\x1b[31mError: SSH connection details not configured in TerminalView.tsx\x1b[0m');
        // }

        // Focus
        term.focus();
      } catch (e) {
        console.error("Error initializing terminal:", e);
      }
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

    // Cleanup function for useEffect
    return () => {
      console.log("Cleaning up TerminalView...");
      ipcRenderer.removeListener('terminal-incoming-data', handleIncomingData);
      ipcRenderer.removeListener('terminal-status', handleStatusUpdate);
      window.removeEventListener('resize', handleWindowResize);
      dataListenerDisposable?.dispose();
      resizeListenerDisposable?.dispose();
      // webglAddonInstance.current?.dispose(); // Temporarily disabled
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      term?.dispose();
      termInstance.current = null;
    };
  }, [isTerminalReady, isConnected]); // Depend on isTerminalReady and isConnected

  return (
    <div
      ref={terminalRef}
      style={{
        height: '100%',
        width: '100%',
        backgroundColor: '#1e1e1e',
        position: 'relative', // Ensure proper layout
        display: 'flex',      // Use flexbox for better sizing
        flexDirection: 'column'
      }}
    />
  );
};

export default TerminalView;
