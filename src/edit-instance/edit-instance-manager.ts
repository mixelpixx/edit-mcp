import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

export interface EditCommand {
  type: 'open' | 'close' | 'save' | 'edit' | 'find' | 'replace' | 'goto';
  params: any;
}

export interface EditResult {
  success: boolean;
  message?: string;
  data?: any;
}

export interface EditInstanceState {
  sessionId: string;
  openFiles: string[];
  activeFile?: string;
  running: boolean;
}

export interface MultiFileEditOperation {
  files: string[];
  operation: EditCommand;
}

export interface ComplexEditOperation {
  type: string;
  params: any;
}

export class EditInstance extends EventEmitter {
  private process: ChildProcess;
  private sessionId: string;
  private openFiles: Set<string> = new Set();
  private activeFile?: string;
  private running: boolean = false;
  private outputBuffer: string = '';
  private errorBuffer: string = '';
  private commandQueue: Array<{
    command: string;
    resolve: (result: string) => void;
    reject: (error: Error) => void;
  }> = [];
  private commandInProgress: boolean = false;

  constructor(process: ChildProcess, sessionId: string) {
    super();
    this.process = process;
    this.sessionId = sessionId;
    this.setupProcessHandlers();
  }

  private setupProcessHandlers(): void {
    this.process.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      this.outputBuffer += output;
      this.emit('stdout', output);
      this.checkCommandCompletion();
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const error = data.toString();
      this.errorBuffer += error;
      this.emit('stderr', error);
    });

    this.process.on('exit', (code: number | null) => {
      this.running = false;
      this.emit('exit', code);
      
      // Reject any pending commands
      while (this.commandQueue.length > 0) {
        const command = this.commandQueue.shift();
        if (command) {
          command.reject(new Error(`Edit process exited with code ${code}`));
        }
      }
    });

    this.running = true;
  }

  private checkCommandCompletion(): void {
    if (this.commandQueue.length === 0 || !this.commandInProgress) {
      return;
    }

    // Check if the command has completed
    // This is a simplified approach; in a real implementation, we would need
    // to look for specific markers in the output to determine completion
    if (this.outputBuffer.includes('Command completed')) {
      const command = this.commandQueue.shift();
      if (command) {
        this.commandInProgress = false;
        command.resolve(this.outputBuffer);
        this.outputBuffer = '';
        this.errorBuffer = '';
        this.processNextCommand();
      }
    }
  }

  private processNextCommand(): void {
    if (this.commandQueue.length === 0 || this.commandInProgress) {
      return;
    }

    const command = this.commandQueue[0];
    this.commandInProgress = true;
    this.process.stdin?.write(command.command + '\n');
  }

  public async openFile(filePath: string): Promise<void> {
    await this.executeCommand(`open ${filePath}`);
    this.openFiles.add(filePath);
    this.activeFile = filePath;
  }

  public async closeFile(filePath: string): Promise<void> {
    await this.executeCommand(`close ${filePath}`);
    this.openFiles.delete(filePath);
    
    if (this.activeFile === filePath) {
      this.activeFile = undefined;
    }
  }

  public async executeCommand(command: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!this.running) {
        reject(new Error('Edit process is not running'));
        return;
      }

      this.commandQueue.push({ command, resolve, reject });
      
      if (!this.commandInProgress) {
        this.processNextCommand();
      }
    });
  }

  public async getState(): Promise<EditInstanceState> {
    return {
      sessionId: this.sessionId,
      openFiles: Array.from(this.openFiles),
      activeFile: this.activeFile,
      running: this.running
    };
  }

  public async terminate(): Promise<void> {
    if (!this.running) {
      return;
    }

    // Try to gracefully exit
    try {
      await this.executeCommand('exit');
    } catch (error) {
      // Ignore errors
    }

    // Force kill if still running
    if (this.running) {
      this.process.kill();
    }
  }
}

export class EditInstanceManager {
  private instances: Map<string, EditInstance> = new Map();
  private editExecutablePath: string;
  private maxInstances: number;
  private instanceTimeout: number;

  constructor(editExecutablePath: string, maxInstances: number = 5, instanceTimeout: number = 300000) {
    this.editExecutablePath = editExecutablePath;
    this.maxInstances = maxInstances;
    this.instanceTimeout = instanceTimeout;
  }

  public async createInstance(sessionId: string = uuidv4()): Promise<EditInstance> {
    if (this.instances.size >= this.maxInstances) {
      throw new Error(`Maximum number of Edit instances (${this.maxInstances}) reached`);
    }

    const process = spawn(this.editExecutablePath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    const instance = new EditInstance(process, sessionId);
    this.instances.set(sessionId, instance);

    // Set up timeout to destroy the instance if it's not used
    setTimeout(() => {
      if (this.instances.has(sessionId)) {
        console.log(`Edit instance ${sessionId} timed out, destroying...`);
        this.destroyInstance(sessionId).catch(console.error);
      }
    }, this.instanceTimeout);

    return instance;
  }

  public async destroyInstance(sessionId: string): Promise<void> {
    const instance = this.instances.get(sessionId);
    
    if (!instance) {
      throw new Error(`Edit instance ${sessionId} not found`);
    }

    await instance.terminate();
    this.instances.delete(sessionId);
  }

  public async executeEditCommand(sessionId: string, command: EditCommand): Promise<EditResult> {
    const instance = this.instances.get(sessionId);
    
    if (!instance) {
      throw new Error(`Edit instance ${sessionId} not found`);
    }

    try {
      let result: string;

      switch (command.type) {
        case 'open':
          await instance.openFile(command.params.path);
          return { success: true };

        case 'close':
          await instance.closeFile(command.params.path);
          return { success: true };

        case 'save':
          result = await instance.executeCommand(`save ${command.params.path}`);
          return { success: true, message: result };

        case 'edit':
          // This is a simplified approach; in a real implementation, we would need
          // to handle different types of edits (insert, delete, replace, etc.)
          result = await instance.executeCommand(`edit ${JSON.stringify(command.params)}`);
          return { success: true, message: result };

        case 'find':
          result = await instance.executeCommand(`find ${command.params.pattern}`);
          return { success: true, message: result };

        case 'replace':
          result = await instance.executeCommand(`replace ${command.params.pattern} ${command.params.replacement}`);
          return { success: true, message: result };

        case 'goto':
          result = await instance.executeCommand(`goto ${command.params.line} ${command.params.column}`);
          return { success: true, message: result };

        default:
          throw new Error(`Unknown command type: ${command.type}`);
      }
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  public async createEditSession(files: string[]): Promise<string> {
    const sessionId = uuidv4();
    const instance = await this.createInstance(sessionId);

    // Open all files
    for (const file of files) {
      await instance.openFile(file);
    }

    return sessionId;
  }

  public async closeEditSession(sessionId: string): Promise<void> {
    await this.destroyInstance(sessionId);
  }

  public async performComplexEdit(sessionId: string, operation: ComplexEditOperation): Promise<EditResult> {
    const instance = this.instances.get(sessionId);
    
    if (!instance) {
      throw new Error(`Edit instance ${sessionId} not found`);
    }

    try {
      // This is a simplified approach; in a real implementation, we would need
      // to handle different types of complex edits
      const result = await instance.executeCommand(`complex-edit ${JSON.stringify(operation)}`);
      return { success: true, message: result };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  public async coordinateMultiFileEdit(operation: MultiFileEditOperation): Promise<EditResult[]> {
    const sessionId = await this.createEditSession(operation.files);
    const results: EditResult[] = [];

    try {
      for (const file of operation.files) {
        // Clone the operation for each file
        const fileOperation: EditCommand = {
          ...operation.operation,
          params: {
            ...operation.operation.params,
            path: file
          }
        };

        const result = await this.executeEditCommand(sessionId, fileOperation);
        results.push(result);
      }
    } finally {
      // Always close the session
      await this.closeEditSession(sessionId).catch(console.error);
    }

    return results;
  }

  public async getInstanceState(sessionId: string): Promise<EditInstanceState> {
    const instance = this.instances.get(sessionId);
    
    if (!instance) {
      throw new Error(`Edit instance ${sessionId} not found`);
    }

    return await instance.getState();
  }

  public async getAllInstanceStates(): Promise<Map<string, EditInstanceState>> {
    const states = new Map<string, EditInstanceState>();
    
    for (const [sessionId, instance] of this.instances.entries()) {
      states.set(sessionId, await instance.getState());
    }
    
    return states;
  }

  public dispose(): void {
    // Destroy all instances
    for (const [sessionId, instance] of this.instances.entries()) {
      instance.terminate().catch(console.error);
    }
    
    this.instances.clear();
  }
}