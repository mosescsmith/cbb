// Debug logging utility for predictions

export interface DebugLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  data?: any;
}

class DebugLogger {
  private logs: DebugLog[] = [];
  private maxLogs = 100;
  private listeners: Set<(logs: DebugLog[]) => void> = new Set();

  log(level: DebugLog['level'], message: string, data?: any) {
    const log: DebugLog = {
      timestamp: new Date(),
      level,
      message,
      data,
    };

    this.logs.push(log);

    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Notify listeners
    this.notifyListeners();

    // Also log to console when debug is enabled
    if (this.isDebugEnabled()) {
      const timestamp = log.timestamp.toLocaleTimeString();
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

      if (data) {
        console.log(prefix, message, data);
      } else {
        console.log(prefix, message);
      }
    }
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  error(message: string, data?: any) {
    this.log('error', message, data);
  }

  success(message: string, data?: any) {
    this.log('success', message, data);
  }

  getLogs(): DebugLog[] {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
    this.notifyListeners();
  }

  subscribe(listener: (logs: DebugLog[]) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getLogs()));
  }

  isDebugEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('debug-predictions') === 'true';
  }

  setDebugEnabled(enabled: boolean) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('debug-predictions', enabled ? 'true' : 'false');

    if (enabled) {
      this.info('Debug mode enabled');
    }
  }
}

// Singleton instance
export const debugLogger = new DebugLogger();
