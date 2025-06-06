import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { EventEmitter } from 'events';

// Promisify fs functions
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const appendFile = util.promisify(fs.appendFile);
const stat = util.promisify(fs.stat);
const unlink = util.promisify(fs.unlink);
const mkdir = util.promisify(fs.mkdir);
const readdir = util.promisify(fs.readdir);

export interface FileStats {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  createdAt: Date;
  modifiedAt: Date;
  accessedAt: Date;
}

export interface SearchResult {
  line: number;
  column: number;
  text: string;
  linesBefore: string[];
  linesAfter: string[];
}

export interface FileChangeEvent {
  type: 'create' | 'update' | 'delete';
  path: string;
}

export interface FileWatcher {
  path: string;
  close(): void;
}

export class FileSystemManager extends EventEmitter {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private backups: Map<string, string> = new Map();

  constructor() {
    super();
  }

  /**
   * Reads a file and returns its content
   */
  public async readFile(filePath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    try {
      return await readFile(filePath, { encoding });
    } catch (error: any) {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Writes content to a file, creating it if it doesn't exist
   */
  public async writeFile(filePath: string, content: string, encoding: BufferEncoding = 'utf8'): Promise<void> {
    try {
      // Ensure the directory exists
      await this.ensureDirectoryExists(path.dirname(filePath));
      await writeFile(filePath, content, { encoding });
      this.emitChangeEvent('update', filePath);
    } catch (error: any) {
      throw new Error(`Failed to write file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Appends content to a file
   */
  public async appendFile(filePath: string, content: string, encoding: BufferEncoding = 'utf8'): Promise<void> {
    try {
      // Ensure the directory exists
      await this.ensureDirectoryExists(path.dirname(filePath));
      await appendFile(filePath, content, { encoding });
      this.emitChangeEvent('update', filePath);
    } catch (error: any) {
      throw new Error(`Failed to append to file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Deletes a file
   */
  public async deleteFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
      this.emitChangeEvent('delete', filePath);
    } catch (error: any) {
      throw new Error(`Failed to delete file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Gets file statistics
   */
  public async getFileStats(filePath: string): Promise<FileStats> {
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
    } catch (error: any) {
      throw new Error(`Failed to get file stats for ${filePath}: ${error.message}`);
    }
  }

  /**
   * Finds occurrences of a pattern in a file
   */
  public async findInFile(filePath: string, pattern: RegExp, contextLines: number = 2): Promise<SearchResult[]> {
    try {
      const content = await this.readFile(filePath);
      const lines = content.split('\n');
      const results: SearchResult[] = [];

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
    } catch (error: any) {
      throw new Error(`Failed to search in file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Replaces occurrences of a pattern in a file
   */
  public async replaceInFile(filePath: string, pattern: RegExp, replacement: string): Promise<number> {
    try {
      const content = await this.readFile(filePath);
      const newContent = content.replace(pattern, replacement);
      const count = (content.match(pattern) || []).length;
      
      if (count > 0) {
        await this.writeFile(filePath, newContent);
      }
      
      return count;
    } catch (error: any) {
      throw new Error(`Failed to replace in file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Creates a backup of a file
   */
  public async createBackup(filePath: string): Promise<string> {
    try {
      const content = await this.readFile(filePath);
      const backupPath = `${filePath}.backup.${Date.now()}`;
      await this.writeFile(backupPath, content);
      this.backups.set(filePath, backupPath);
      return backupPath;
    } catch (error: any) {
      throw new Error(`Failed to create backup of ${filePath}: ${error.message}`);
    }
  }

  /**
   * Restores a backup of a file
   */
  public async restoreBackup(backupPath: string, originalPath: string): Promise<void> {
    try {
      const content = await this.readFile(backupPath);
      await this.writeFile(originalPath, content);
    } catch (error: any) {
      throw new Error(`Failed to restore backup ${backupPath} to ${originalPath}: ${error.message}`);
    }
  }

  /**
   * Reads multiple files at once
   */
  public async batchRead(filePaths: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    
    await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const content = await this.readFile(filePath);
          results.set(filePath, content);
        } catch (error) {
          // Skip files that can't be read
        }
      })
    );
    
    return results;
  }

  /**
   * Writes to multiple files at once
   */
  public async batchWrite(files: Map<string, string>): Promise<void> {
    await Promise.all(
      Array.from(files.entries()).map(async ([filePath, content]) => {
        await this.writeFile(filePath, content);
      })
    );
  }

  /**
   * Lists files in a directory
   */
  public async listFiles(dirPath: string, pattern?: string): Promise<string[]> {
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
    } catch (error: any) {
      throw new Error(`Failed to list files in ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Creates a directory if it doesn't exist
   */
  public async createDirectory(dirPath: string): Promise<void> {
    try {
      await this.ensureDirectoryExists(dirPath);
      this.emitChangeEvent('create', dirPath);
    } catch (error: any) {
      throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Ensures a directory exists, creating it if necessary
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error: any) {
      // Ignore if directory already exists
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Watches a file for changes
   */
  public watchFile(filePath: string, callback: (event: FileChangeEvent) => void): FileWatcher {
    try {
      const watcher = fs.watch(filePath, (eventType, filename) => {
        if (eventType === 'change') {
          callback({
            type: 'update',
            path: filePath
          });
        } else if (eventType === 'rename') {
          // Check if the file still exists
          fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
              // File doesn't exist anymore
              callback({
                type: 'delete',
                path: filePath
              });
            } else {
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
    } catch (error: any) {
      throw new Error(`Failed to watch file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Stops watching a file
   */
  public unwatchFile(filePath: string): void {
    const watcher = this.watchers.get(filePath);
    
    if (watcher) {
      watcher.close();
      this.watchers.delete(filePath);
    }
  }

  /**
   * Emits a file change event
   */
  private emitChangeEvent(type: 'create' | 'update' | 'delete', path: string): void {
    this.emit('change', { type, path });
  }

  /**
   * Cleans up resources
   */
  public dispose(): void {
    // Close all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    
    this.watchers.clear();
    this.backups.clear();
    this.removeAllListeners();
  }
}