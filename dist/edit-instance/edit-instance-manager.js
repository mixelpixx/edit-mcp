"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EditInstanceManager = exports.EditInstance = void 0;
const child_process_1 = require("child_process");
const uuid_1 = require("uuid");
const events_1 = require("events");
class EditInstance extends events_1.EventEmitter {
    constructor(process, sessionId) {
        super();
        this.openFiles = new Set();
        this.running = false;
        this.outputBuffer = '';
        this.errorBuffer = '';
        this.commandQueue = [];
        this.commandInProgress = false;
        this.process = process;
        this.sessionId = sessionId;
        this.setupProcessHandlers();
    }
    setupProcessHandlers() {
        this.process.stdout?.on('data', (data) => {
            const output = data.toString();
            this.outputBuffer += output;
            this.emit('stdout', output);
            this.checkCommandCompletion();
        });
        this.process.stderr?.on('data', (data) => {
            const error = data.toString();
            this.errorBuffer += error;
            this.emit('stderr', error);
        });
        this.process.on('exit', (code) => {
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
    checkCommandCompletion() {
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
    processNextCommand() {
        if (this.commandQueue.length === 0 || this.commandInProgress) {
            return;
        }
        const command = this.commandQueue[0];
        this.commandInProgress = true;
        this.process.stdin?.write(command.command + '\n');
    }
    async openFile(filePath) {
        await this.executeCommand(`open ${filePath}`);
        this.openFiles.add(filePath);
        this.activeFile = filePath;
    }
    async closeFile(filePath) {
        await this.executeCommand(`close ${filePath}`);
        this.openFiles.delete(filePath);
        if (this.activeFile === filePath) {
            this.activeFile = undefined;
        }
    }
    async executeCommand(command) {
        return new Promise((resolve, reject) => {
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
    async getState() {
        return {
            sessionId: this.sessionId,
            openFiles: Array.from(this.openFiles),
            activeFile: this.activeFile,
            running: this.running
        };
    }
    async terminate() {
        if (!this.running) {
            return;
        }
        // Try to gracefully exit
        try {
            await this.executeCommand('exit');
        }
        catch (error) {
            // Ignore errors
        }
        // Force kill if still running
        if (this.running) {
            this.process.kill();
        }
    }
}
exports.EditInstance = EditInstance;
class EditInstanceManager {
    constructor(editExecutablePath, maxInstances = 5, instanceTimeout = 300000) {
        this.instances = new Map();
        this.editExecutablePath = editExecutablePath;
        this.maxInstances = maxInstances;
        this.instanceTimeout = instanceTimeout;
    }
    async createInstance(sessionId = (0, uuid_1.v4)()) {
        if (this.instances.size >= this.maxInstances) {
            throw new Error(`Maximum number of Edit instances (${this.maxInstances}) reached`);
        }
        const process = (0, child_process_1.spawn)(this.editExecutablePath, [], {
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
    async destroyInstance(sessionId) {
        const instance = this.instances.get(sessionId);
        if (!instance) {
            throw new Error(`Edit instance ${sessionId} not found`);
        }
        await instance.terminate();
        this.instances.delete(sessionId);
    }
    async executeEditCommand(sessionId, command) {
        const instance = this.instances.get(sessionId);
        if (!instance) {
            throw new Error(`Edit instance ${sessionId} not found`);
        }
        try {
            let result;
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
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    }
    async createEditSession(files) {
        const sessionId = (0, uuid_1.v4)();
        const instance = await this.createInstance(sessionId);
        // Open all files
        for (const file of files) {
            await instance.openFile(file);
        }
        return sessionId;
    }
    async closeEditSession(sessionId) {
        await this.destroyInstance(sessionId);
    }
    async performComplexEdit(sessionId, operation) {
        const instance = this.instances.get(sessionId);
        if (!instance) {
            throw new Error(`Edit instance ${sessionId} not found`);
        }
        try {
            // This is a simplified approach; in a real implementation, we would need
            // to handle different types of complex edits
            const result = await instance.executeCommand(`complex-edit ${JSON.stringify(operation)}`);
            return { success: true, message: result };
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    }
    async coordinateMultiFileEdit(operation) {
        const sessionId = await this.createEditSession(operation.files);
        const results = [];
        try {
            for (const file of operation.files) {
                // Clone the operation for each file
                const fileOperation = {
                    ...operation.operation,
                    params: {
                        ...operation.operation.params,
                        path: file
                    }
                };
                const result = await this.executeEditCommand(sessionId, fileOperation);
                results.push(result);
            }
        }
        finally {
            // Always close the session
            await this.closeEditSession(sessionId).catch(console.error);
        }
        return results;
    }
    async getInstanceState(sessionId) {
        const instance = this.instances.get(sessionId);
        if (!instance) {
            throw new Error(`Edit instance ${sessionId} not found`);
        }
        return await instance.getState();
    }
    async getAllInstanceStates() {
        const states = new Map();
        for (const [sessionId, instance] of this.instances.entries()) {
            states.set(sessionId, await instance.getState());
        }
        return states;
    }
    dispose() {
        // Destroy all instances
        for (const [sessionId, instance] of this.instances.entries()) {
            instance.terminate().catch(console.error);
        }
        this.instances.clear();
    }
}
exports.EditInstanceManager = EditInstanceManager;
//# sourceMappingURL=edit-instance-manager.js.map