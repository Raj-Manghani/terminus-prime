import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal, ITerminalOptions } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebglAddon } from 'xterm-addon-webgl';
import 'xterm/css/xterm.css';

const termTheme: ITerminalOptions['theme'] = { /* ... full theme ... */
  background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#d4d4d4', selectionBackground: '#264f78',
  black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510', blue: '#2472c8',
  magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5', brightBlack: '#666666',
  brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543', brightBlue: '#3b8eea',
  brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#e5e5e5'
};
const terminalOptions: ITerminalOptions = {
  cursorBlink: true, convertEol: true, fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: 15, theme: termTheme, allowProposedApi: true,
};

interface TerminalViewProps {
  onData: (data: string) => void;
  onResize?: (cols: number, rows: number, height: number, width: number) => void;
  dataToDisplay?: string;
  clearTrigger?: number;
  triggerFit?: number; // New prop to trigger fit
}

const TerminalView: React.FC<TerminalViewProps> = React.memo(({
  onData,
  onResize,
  dataToDisplay,
  clearTrigger,
  triggerFit // Destructure new prop
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const fitAndNotifyResize = useCallback(() => {
    if (fitAddonRef.current && termInstanceRef.current && terminalRef.current) {
      try {
        fitAddonRef.current.fit();
        const { cols, rows } = termInstanceRef.current;
        if (cols > 0 && rows > 0 && onResize) {
          onResize(cols, rows, terminalRef.current.clientHeight, terminalRef.current.clientWidth);
        }
      } catch (e) { console.error("TerminalView: Error fitting/notifying resize:", e); }
    }
  }, [onResize]);

  useEffect(() => { // Initialize terminal
    if (terminalRef.current && !termInstanceRef.current) {
      const term = new Terminal(terminalOptions);
      const fitAddon = new FitAddon();
      termInstanceRef.current = term; fitAddonRef.current = fitAddon;
      term.loadAddon(fitAddon);
      try { new WebglAddon().activate(term); } catch (e) { console.warn('WebGL addon failed.', e); }
      term.open(terminalRef.current);
      // fitAddon.fit(); // Initial fit can be handled by ResizeObserver or triggerFit
      term.onData(onData);

      const parentEl = terminalRef.current.parentElement;
      if (parentEl && onResize) { // Only observe if onResize is provided
        const obs = new ResizeObserver(fitAndNotifyResize);
        obs.observe(parentEl); resizeObserverRef.current = obs;
        setTimeout(fitAndNotifyResize, 50); // Initial resize call
      }
      return () => {
        resizeObserverRef.current?.disconnect(); term.dispose();
        termInstanceRef.current = null; fitAddonRef.current = null;
      };
    }
  }, [onData, onResize, fitAndNotifyResize]); // Main init effect dependencies

  useEffect(() => { // Handle incoming data
    if (termInstanceRef.current && dataToDisplay !== undefined) {
      termInstanceRef.current.write(dataToDisplay);
    }
  }, [dataToDisplay]);

  useEffect(() => { // Handle clear trigger
    if (termInstanceRef.current && clearTrigger !== undefined && clearTrigger > 0) {
      termInstanceRef.current.clear();
    }
  }, [clearTrigger]);

  useEffect(() => { // Handle external fit trigger
    if (triggerFit && triggerFit > 0 && fitAddonRef.current) {
      // console.log('TerminalView: fit triggered by prop change', triggerFit);
      fitAddonRef.current.fit();
    }
  }, [triggerFit]);

  return <div ref={terminalRef} style={{ width: '100%', height: '100%', backgroundColor: termTheme.background }} />;
});
export default TerminalView;
