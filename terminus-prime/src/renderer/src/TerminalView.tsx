import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal, ITerminalOptions } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebglAddon } from 'xterm-addon-webgl'; // Corrected import if needed
import 'xterm/css/xterm.css';
import type { SshStatus } from '../../preload';

const termTheme: ITerminalOptions['theme'] = {
  background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#d4d4d4',
  selectionBackground: '#264f78', black: '#000000', red: '#cd3131',
  green: '#0dbc79', yellow: '#e5e510', blue: '#2472c8', magenta: '#bc3fbc',
  cyan: '#11a8cd', white: '#e5e5e5', brightBlack: '#666666',
  brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543',
  brightBlue: '#3b8eea', brightMagenta: '#d670d6', brightCyan: '#29b8db',
  brightWhite: '#e5e5e5'
};

const terminalOptions: ITerminalOptions = {
  cursorBlink: true, convertEol: true,
  fontFamily: 'Consolas, "Courier New", monospace', fontSize: 15,
  theme: termTheme, allowProposedApi: true, rows: 20,
};

const TerminalView: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [promptVisible, setPromptVisible] = useState(true);

  const writeToTerminal = useCallback((data: string) => {
    termInstanceRef.current?.write(data);
  }, []);

  const fitAndResize = useCallback(() => {
    if (fitAddonRef.current && termInstanceRef.current && terminalRef.current) {
      try {
        fitAddonRef.current.fit();
        const dims = {
          cols: termInstanceRef.current.cols,
          rows: termInstanceRef.current.rows,
          height: terminalRef.current.clientHeight || 0,
          width: terminalRef.current.clientWidth || 0
        };
        if (dims.cols > 0 && dims.rows > 0 && window.electronAPI) { // Check electronAPI
          window.electronAPI.sshResize(dims);
        }
      } catch (e) { console.error("Error fitting/resizing terminal:", e); }
    }
  }, []);

  useEffect(() => {
    let term: Terminal;
    let fitAddonInst: FitAddon; // Renamed to avoid conflict with Addon type
    let resizeObs: ResizeObserver; // Renamed
    let unsubData: (() => void) | undefined;
    let unsubStatus: (() => void) | undefined;

    if (terminalRef.current && !termInstanceRef.current && window.electronAPI) { // Ensure electronAPI is available
      term = new Terminal(terminalOptions);
      termInstanceRef.current = term;

      fitAddonInst = new FitAddon();
      fitAddonRef.current = fitAddonInst;
      term.loadAddon(fitAddonInst);

      try {
        const webgl = new WebglAddon();
        term.loadAddon(webgl); // Use loaded addon
      }
      catch (e) { console.warn('WebGL addon failed.', e); }

      term.open(terminalRef.current);
      fitAndResize();

      term.writeln('Welcome to Terminus Prime!');
      term.writeln('Configure connection details above and click Connect.');
      if (promptVisible) term.write('$ ');

      term.onData((data) => {
        window.electronAPI.sshSendData(data);
      });

      unsubData = window.electronAPI.onSshData(writeToTerminal);

      unsubStatus = window.electronAPI.onSshStatus((status: SshStatus) => {
        console.log('SSH Status Update:', status);
        const message = `\r\n[STATUS: ${status.status}] ${status.message}\r\n`;
        term.writeln(message);
        if (status.status === 'connected') setPromptVisible(false);
        else if (status.status === 'disconnected' || status.status === 'error') {
            setPromptVisible(true);
            if (termInstanceRef.current) termInstanceRef.current.write('$ ');
        }
      });

      const parentEl = terminalRef.current.parentElement;
      if (parentEl) {
        resizeObs = new ResizeObserver(fitAndResize);
        resizeObs.observe(parentEl);
      }

      return () => {
        resizeObs?.disconnect();
        unsubData?.();
        unsubStatus?.();
        term.dispose();
        termInstanceRef.current = null;
        fitAddonRef.current = null; // Clear ref
      };
    }
  }, [writeToTerminal, fitAndResize, promptVisible]);

  return <div ref={terminalRef} style={{ width: '100%', height: '100%', backgroundColor: termTheme.background }} />;
};
export default TerminalView;
