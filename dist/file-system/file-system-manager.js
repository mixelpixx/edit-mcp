"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileSystemManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const util = __importStar(require("util"));
const events_1 = require("events");
// Promisify fs functions
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const appendFile = util.promisify(fs.appendFile);
const stat = util.promisify(fs.stat);
const unlink = util.promisify(fs.unlink);
const mkdir = util.promisify(fs.mkdir);
const readdir = util.promisify(fs.readdir);
class FileSystemManager extends events_1.EventEmitter {
    constructor() {
        super();
        this.watchers = new Map();
        this.backups = new Map();
    }
    /**
     * Reads a file and returns its content
     */
    async readFile(filePath, encoding = 'utf8') {
        try {
            return await readFile(filePath, { encoding });
        }
        catch (error) {
            throw new Error(`Failed to read file ${filePath}: ${error.message}`);
        }
    }
    /**
     * Writes content to a file, creating it if it doesn't exist
     */
    async writeFile(filePath, content, encoding = 'utf8') {
        try {
            // Ensure the directory exists
            await this.ensureDirectoryExists(path.dirname(filePath));
            await writeFile(filePath, content, { encoding });
            this.emitChangeEvent('update', filePath);
        }
        catch (error) {
            throw new Error(`Failed to write file ${filePath}: ${error.message}`);
        }
    }
    /**
     * Appends content to a file
     */
    async appendFile(filePath, content, encoding = 'utf8') {
        try {
            // Ensure the directory exists
            await this.ensureDirectoryExists(path.dirname(filePath));
            await appendFile(filePath, content, { encoding });
            this.emitChangeEvent('update', filePath);
        }
        catch (error) {
            throw new Error(`Failed to append to file ${filePath}: ${error.message}`);
        }
    }
    /**
     * Deletes a file
     */
    async deleteFile(filePath) {
        try {
            await unlink(filePath);
            this.emitChangeEvent('delete', filePath);
        }
        catch (error) {
            throw new Error(`Failed to delete file ${filePath}: ${error.message}`);
        }
    }
    /**
     * Gets file statistics
     */
    async getFileStats(filePath) {
        try {
            const stats = await stat(filePath);
            return {
                size: stats.size,
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile(),
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime,
                accessedAt: stats.atime
            };
        }
        catch (error) {
            throw new Error(`Failed to get file stats for ${filePath}: ${error.message}`);
        }
    }
    /**
     * Finds occurrences of a pattern in a file
     */
    async findInFile(filePath, pattern, contextLines = 2) {
        try {
            const content = await this.readFile(filePath);
            const lines = content.split('\n');
            const results = [];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const match = pattern.exec(line);
                if (match) {
                    const linesBefore = lines.slice(Math.max(0, i - contextLines), i);
                    const linesAfter = lines.slice(i + 1, Math.min(lines.length, i + contextLines + 1));
                    results.push({
                        line: i + 1,
                        column: match.index + 1,
                        text: line,
                        linesBefore,
                        linesAfter
                    });
                }
            }
            return results;
        }
        catch (error) {
            throw new Error(`Failed to search in file ${filePath}: ${error.message}`);
        }
    }
    /**
     * Replaces occurrences of a pattern in a file
     */
    async replaceInFile(filePath, pattern, replacement) {
        try {
            const content = await this.readFile(filePath);
            const newContent = content.replace(pattern, replacement);
            const count = (content.match(pattern) || []).length;
            if (count > 0) {
                await this.writeFile(filePath, newContent);
            }
            return count;
        }
        catch (error) {
            throw new Error(`Failed to replace in file ${filePath}: ${error.message}`);
        }
    }
    /**
     * Creates a backup of a file
     */
    async createBackup(filePath) {
        try {
            const content = await this.readFile(filePath);
            const backupPath = `${filePath}.backup.${Date.now()}`;
            await this.writeFile(backupPath, content);
            this.backups.set(filePath, backupPath);
            return backupPath;
        }
        catch (error) {
            throw new Error(`Failed to create backup of ${filePath}: ${error.message}`);
        }
    }
    /**
     * Restores a backup of a file
     */
    async restoreBackup(backupPath, originalPath) {
        try {
            const content = await this.readFile(backupPath);
            await this.writeFile(originalPath, content);
        }
        catch (error) {
            throw new Error(`Failed to restore backup ${backupPath} to ${originalPath}: ${error.message}`);
        }
    }
    /**
     * Reads multiple files at once
     */
    async batchRead(filePaths) {
        const results = new Map();
        await Promise.all(filePaths.map(async (filePath) => {
            try {
                const content = await this.readFile(filePath);
                results.set(filePath, content);
            }
            catch (error) {
                // Skip files that can't be read
            }
        }));
        return results;
    }
    /**
     * Writes to multiple files at once
     */
    async batchWrite(files) {
        await Promise.all(Array.from(files.entries()).map(async ([filePath, content]) => {
            await this.writeFile(filePath, content);
        }));
    }
    /**
     * Lists files in a directory
     */
    async listFiles(dirPath, pattern) {
        try {
            const entries = await readdir(dirPath, { withFileTypes: true });
            let files = entries
                .filter(entry => entry.isFile())
                .map(entry => path.join(dirPath, entry.name));
            if (pattern) {
                const regex = new RegExp(pattern);
                files = files.filter(file => regex.test(file));
            }
            return files;
        }
        catch (error) {
            throw new Error(`Failed to list files in ${dirPath}: ${error.message}`);
        }
    }
    /**
     * Creates a directory if it doesn't exist
     */
    async createDirectory(dirPath) {
        try {
            await this.ensureDirectoryExists(dirPath);
            this.emitChangeEvent('create', dirPath);
        }
        catch (error) {
            throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
        }
    }
    /**
     * Ensures a directory exists, creating it if necessary
     */
    async ensureDirectoryExists(dirPath) {
        try {
            await mkdir(dirPath, { recursive: true });
        }
        catch (error) {
            // Ignore if directory already exists
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }
    /**
     * Watches a file for changes
     */
    watchFile(filePath, callback) {
        try {
            const watcher = fs.watch(filePath, (eventType, filename) => {
                if (eventType === 'change') {
                    callback({
                        type: 'update',
                        path: filePath
                    });
                }
                else if (eventType === 'rename') {
                    // Check if the file still exists
                    fs.access(filePath, fs.constants.F_OK, (err) => {
                        if (err) {
                            // File doesn't exist anymore
                            callback({
                                type: 'delete',
                                path: filePath
                            });
                        }
                        else {
                            // File was created or renamed
                            callback({
                                type: 'create',
                                path: filePath
                            });
                        }
                    });
                }
            });
            this.watchers.set(filePath, watcher);
            return {
                path: filePath,
                close: () => this.unwatchFile(filePath)
            };
        }
        catch (error) {
            throw new Error(`Failed to watch file ${filePath}: ${error.message}`);
        }
    }
    /**
     * Stops watching a file
     */
    unwatchFile(filePath) {
        const watcher = this.watchers.get(filePath);
        if (watcher) {
            watcher.close();
            this.watchers.delete(filePath);
        }
    }
    /**
     * Emits a file change event
     */
    emitChangeEvent(type, path) {
        this.emit('change', { type, path });
    }
    /**
     * Cleans up resources
     */
    dispose() {
        // Close all watchers
        for (const watcher of this.watchers.values()) {
            watcher.close();
        }
        this.watchers.clear();
        this.backups.clear();
        this.removeAllListeners();
    }
}
exports.FileSystemManager = FileSystemManager;
//# sourceMappingURL=file-system-manager.js.map