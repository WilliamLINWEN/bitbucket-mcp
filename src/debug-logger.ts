/**
 * Debug logger for Bitbucket MCP Server
 *
 * This utility provides structured logging with timestamps and categories
 * specifically designed to avoid interfering with MCP communication.
 * Enhanced version with file logging, log rotation, and better type safety.
 */

import * as fs from 'fs';
import * as path from 'path';

// Log level types for better type safety
export type LogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

// Log levels in order of verbosity
const LEVELS: Record<LogLevel, number> = {
    none: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5
} as const;

// Environment configuration
const DEBUG_LEVEL = (process.env.BITBUCKET_MCP_DEBUG_LEVEL || 'info') as LogLevel;
const DEBUG_FILE = process.env.BITBUCKET_MCP_DEBUG_FILE || '';
const DEBUG_FILE_MAX_SIZE = parseInt(process.env.BITBUCKET_MCP_DEBUG_FILE_MAX_SIZE || '10485760', 10); // 10MB default
const DEBUG_FILE_MAX_FILES = parseInt(process.env.BITBUCKET_MCP_DEBUG_FILE_MAX_FILES || '5', 10); // 5 files default
const ENABLE_STRUCTURED_LOGS = process.env.BITBUCKET_MCP_STRUCTURED_LOGS === 'true';

// Current logging level
const currentLevel = LEVELS[DEBUG_LEVEL] || LEVELS.info;

// Track execution flow with timestamps
let startTime = Date.now();
const timemarks: Record<string, number> = {};

// File logging state
let logFileHandle: fs.WriteStream | null = null;
let currentLogFileSize = 0;

/**
 * Interface for structured log entries
 */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    category: string;
    message: string;
    elapsed: number;
    data?: any;
    processId: number;
    memoryUsage?: NodeJS.MemoryUsage;
}

/**
 * Interface for logger configuration
 */
export interface LoggerConfig {
    level: LogLevel;
    enableFileLogging: boolean;
    logFile?: string;
    maxFileSize: number;
    maxFiles: number;
    enableStructuredLogs: boolean;
    includeMemoryUsage: boolean;
}

/**
 * Get current logger configuration
 */
export function getLoggerConfig(): LoggerConfig {
    return {
        level: DEBUG_LEVEL,
        enableFileLogging: !!DEBUG_FILE,
        logFile: DEBUG_FILE,
        maxFileSize: DEBUG_FILE_MAX_SIZE,
        maxFiles: DEBUG_FILE_MAX_FILES,
        enableStructuredLogs: ENABLE_STRUCTURED_LOGS,
        includeMemoryUsage: currentLevel >= LEVELS.debug
    };
}

/**
 * Initialize file logging if configured
 */
function initializeFileLogging(): void {
    if (!DEBUG_FILE) return;

    try {
        // Ensure log directory exists
        const logDir = path.dirname(DEBUG_FILE);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        // Check current file size
        if (fs.existsSync(DEBUG_FILE)) {
            const stats = fs.statSync(DEBUG_FILE);
            currentLogFileSize = stats.size;
            
            // Rotate if file is too large
            if (currentLogFileSize >= DEBUG_FILE_MAX_SIZE) {
                rotateLogFile();
            }
        }

        // Create write stream
        logFileHandle = fs.createWriteStream(DEBUG_FILE, { flags: 'a' });
        
        logFileHandle.on('error', (err) => {
            console.error(`[DEBUG-LOGGER] Failed to write to log file: ${err.message}`);
            logFileHandle = null;
        });

    } catch (error) {
        console.error(`[DEBUG-LOGGER] Failed to initialize file logging: ${error}`);
    }
}

/**
 * Rotate log files when they get too large
 */
function rotateLogFile(): void {
    if (!DEBUG_FILE) return;

    try {
        // Close current handle
        if (logFileHandle) {
            logFileHandle.end();
            logFileHandle = null;
        }

        // Rotate existing files
        for (let i = DEBUG_FILE_MAX_FILES - 1; i >= 1; i--) {
            const oldFile = `${DEBUG_FILE}.${i}`;
            const newFile = `${DEBUG_FILE}.${i + 1}`;
            
            if (fs.existsSync(oldFile)) {
                if (i === DEBUG_FILE_MAX_FILES - 1) {
                    // Delete the oldest file
                    fs.unlinkSync(oldFile);
                } else {
                    fs.renameSync(oldFile, newFile);
                }
            }
        }

        // Move current file to .1
        if (fs.existsSync(DEBUG_FILE)) {
            fs.renameSync(DEBUG_FILE, `${DEBUG_FILE}.1`);
        }

        // Reset size counter
        currentLogFileSize = 0;

        // Reinitialize
        initializeFileLogging();

    } catch (error) {
        console.error(`[DEBUG-LOGGER] Failed to rotate log file: ${error}`);
    }
}

/**
 * Write to log file if configured
 */
function writeToFile(message: string): void {
    if (!logFileHandle) return;

    try {
        const logLine = `${message}\n`;
        logFileHandle.write(logLine);
        
        currentLogFileSize += Buffer.byteLength(logLine, 'utf8');
        
        // Check if rotation is needed
        if (currentLogFileSize >= DEBUG_FILE_MAX_SIZE) {
            rotateLogFile();
        }
    } catch (error) {
        console.error(`[DEBUG-LOGGER] Failed to write to log file: ${error}`);
    }
}

/**
 * Create a structured log entry
 */
function createLogEntry(level: LogLevel, category: string, message: string, data?: any): LogEntry {
    const config = getLoggerConfig();
    
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        category,
        message,
        elapsed: Date.now() - startTime,
        processId: process.pid
    };

    if (data !== undefined) {
        entry.data = data;
    }

    if (config.includeMemoryUsage) {
        entry.memoryUsage = process.memoryUsage();
    }

    return entry;
}

/**
 * Format log message for console output
 */
function formatConsoleMessage(entry: LogEntry): string {
    let logMessage = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}] +${entry.elapsed}ms: ${entry.message}`;
    
    if (entry.data !== undefined) {
        if (typeof entry.data === 'object') {
            try {
                const dataStr = JSON.stringify(entry.data, null, 2);
                logMessage += `\n${dataStr.length > 1000 ? dataStr.substring(0, 1000) + '...[truncated]' : dataStr}`;
            } catch (err) {
                logMessage += '\n[Object cannot be stringified]';
            }
        } else {
            logMessage += `\n${entry.data}`;
        }
    }

    if (entry.memoryUsage && currentLevel >= LEVELS.trace) {
        const mem = entry.memoryUsage;
        logMessage += `\n[Memory: RSS=${Math.round(mem.rss / 1024 / 1024)}MB, Heap=${Math.round(mem.heapUsed / 1024 / 1024)}MB/${Math.round(mem.heapTotal / 1024 / 1024)}MB]`;
    }

    return logMessage;
}

/**
 * Log a debug message with category and timestamp
 */
export function debug(level: LogLevel, category: string, message: string, data?: any): void {
    if (LEVELS[level] <= currentLevel) {
        const entry = createLogEntry(level, category, message, data);
        
        // Console output (always to stderr)
        const consoleMessage = formatConsoleMessage(entry);
        console.error(consoleMessage);
        
        // File output
        if (DEBUG_FILE) {
            const fileMessage = ENABLE_STRUCTURED_LOGS 
                ? JSON.stringify(entry)
                : consoleMessage;
            writeToFile(fileMessage);
        }
    }
}

/**
 * Set a time marker with a label
 */
export function mark(label: string): void {
    timemarks[label] = Date.now();
    if (currentLevel >= LEVELS.debug) {
        debug('debug', 'timing', `Mark: ${label}`);
    }
}

/**
 * Measure time since a previous mark
 */
export function measure(label: string, fromMark: string): void {
    if (timemarks[fromMark]) {
        const elapsed = Date.now() - timemarks[fromMark];
        debug('info', 'timing', `${label}: ${elapsed}ms since ${fromMark}`, { 
            measurementLabel: label, 
            fromMark, 
            elapsedMs: elapsed 
        });
    } else {
        debug('warn', 'timing', `Cannot measure ${label}, mark "${fromMark}" not found`, {
            measurementLabel: label,
            fromMark,
            availableMarks: Object.keys(timemarks)
        });
    }
}

/**
 * Reset all timing measurements
 */
export function resetTiming(): void {
    const oldStartTime = startTime;
    startTime = Date.now();
    const oldMarks = { ...timemarks };
    Object.keys(timemarks).forEach(key => delete timemarks[key]);
    
    debug('info', 'timing', 'Timing measurements reset', {
        previousStartTime: new Date(oldStartTime).toISOString(),
        newStartTime: new Date(startTime).toISOString(),
        clearedMarks: Object.keys(oldMarks)
    });
}

/**
 * Get current timing information
 */
export function getTimingInfo(): { startTime: number; marks: Record<string, number>; uptime: number } {
    return {
        startTime,
        marks: { ...timemarks },
        uptime: Date.now() - startTime
    };
}

/**
 * Flush any pending log writes
 */
export function flush(): Promise<void> {
    return new Promise((resolve) => {
        if (logFileHandle) {
            logFileHandle.once('finish', resolve);
            logFileHandle.end();
            logFileHandle = null;
        } else {
            resolve();
        }
    });
}

/**
 * Create specialized debug functions for different log levels
 */
export const logger = {
    error: (category: string, message: string, data?: any) => debug('error', category, message, data),
    warn: (category: string, message: string, data?: any) => debug('warn', category, message, data),
    info: (category: string, message: string, data?: any) => debug('info', category, message, data),
    debug: (category: string, message: string, data?: any) => debug('debug', category, message, data),
    trace: (category: string, message: string, data?: any) => debug('trace', category, message, data),
    mark,
    measure,
    resetTiming,
    getTimingInfo,
    flush,
    getConfig: getLoggerConfig
};

// Initialize file logging on module load
initializeFileLogging();

// Export for CommonJS compatibility
export default logger;
