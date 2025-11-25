'use client';

import { useState, useEffect, useRef } from 'react';
import { debugLogger, DebugLog } from '@/lib/debugLogger';

export function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Subscribe to logger updates
    const unsubscribe = debugLogger.subscribe((newLogs) => {
      setLogs(newLogs);
    });

    // Load initial logs
    setLogs(debugLogger.getLogs());

    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    if (isOpen) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  const getLevelColor = (level: DebugLog['level']) => {
    switch (level) {
      case 'info':
        return 'text-blue-600';
      case 'warn':
        return 'text-yellow-600';
      case 'error':
        return 'text-red-600';
      case 'success':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  const getLevelBg = (level: DebugLog['level']) => {
    switch (level) {
      case 'info':
        return 'bg-blue-50';
      case 'warn':
        return 'bg-yellow-50';
      case 'error':
        return 'bg-red-50';
      case 'success':
        return 'bg-green-50';
      default:
        return 'bg-gray-50';
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  const handleClear = () => {
    debugLogger.clear();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-lg">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-gray-800 text-white cursor-pointer hover:bg-gray-700"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">🔍 Debug Logs</span>
          <span className="text-xs bg-gray-600 px-2 py-1 rounded">{logs.length}</span>
        </div>
        <div className="flex items-center gap-3">
          {isOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 rounded"
            >
              Clear
            </button>
          )}
          <span className="text-lg">{isOpen ? '▼' : '▲'}</span>
        </div>
      </div>

      {/* Logs Content */}
      {isOpen && (
        <div className="h-64 overflow-y-auto bg-gray-50 p-4 font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              No logs yet. Enable debug mode and make a prediction.
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={`flex gap-2 p-2 rounded ${getLevelBg(log.level)}`}
                >
                  <span className="text-gray-500 shrink-0">
                    {formatTime(log.timestamp)}
                  </span>
                  <span className={`font-semibold shrink-0 w-16 ${getLevelColor(log.level)}`}>
                    [{log.level.toUpperCase()}]
                  </span>
                  <span className="text-gray-800">{log.message}</span>
                  {log.data && (
                    <details className="text-gray-600 cursor-pointer">
                      <summary className="text-blue-600 hover:underline">
                        data
                      </summary>
                      <pre className="mt-1 text-xs bg-white p-2 rounded border">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
