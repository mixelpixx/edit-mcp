import { FileSystemManager } from '../file-system/file-system-manager';
import { EditInstanceManager, EditCommand } from '../edit-instance/edit-instance-manager';

export type ComplexityLevel = 'simple' | 'medium' | 'complex';

export interface FileContext {
  requiresAdvancedFeatures: boolean;
  isMultiFile: boolean;
  totalFileSize: number;
  fileCount: number;
}

export interface PerformanceRequirements {
  requiresRealTimeResponse: boolean;
  isHighPriority: boolean;
}

export type ExecutorType = 'filesystem' | 'edit' | 'hybrid';

export interface OperationPlan {
  executor: ExecutorType;
  fallback?: ExecutorType;
  preprocessing?: ExecutorType;
  coordinationStrategy?: 'sequential' | 'parallel' | 'intelligent';
}

export interface MCPOperation {
  type: string;
  method: string;
  params: any;
  affectedFiles: string[];
  requiresRealTimeResponse?: boolean;
}

export interface OptimizedOperation {
  original: MCPOperation;
  plan: OperationPlan;
  batches?: MCPOperation[][];
}

export class OperationRouter {
  private fileSystemManager: FileSystemManager;
  private editInstanceManager: EditInstanceManager;
  private simpleOperationThreshold: number;
  private complexityFactors: {
    fileSize: number;
    operationType: number;
    contextRequirement: number;
  };

  constructor(
    fileSystemManager: FileSystemManager,
    editInstanceManager: EditInstanceManager,
    simpleOperationThreshold: number = 1000,
    complexityFactors?: {
      fileSize: number;
      operationType: number;
      contextRequirement: number;
    }
  ) {
    this.fileSystemManager = fileSystemManager;
    this.editInstanceManager = editInstanceManager;
    this.simpleOperationThreshold = simpleOperationThreshold;
    this.complexityFactors = complexityFactors || {
      fileSize: 0.3,
      operationType: 0.4,
      contextRequirement: 0.3
    };
  }

  /**
   * Routes an operation to the appropriate executor
   */
  public async route(operation: MCPOperation): Promise<OperationPlan> {
    const complexity = this.analyzeComplexity(operation);
    const fileContext = await this.analyzeFileContext(operation);
    const performance = this.analyzePerformanceRequirements(operation);
    
    return this.createExecutionPlan(complexity, fileContext, performance);
  }

  /**
   * Analyzes the complexity of an operation
   */
  private analyzeComplexity(operation: MCPOperation): ComplexityLevel {
    // Simple operations
    const simpleOperations = [
      'read_file_content',
      'write_file_content',
      'append_to_file',
      'get_file_info',
      'list_files',
      'create_directory',
      'delete_file',
      'simple_find_replace'
    ];

    // Complex operations
    const complexOperations = [
      'interactive_edit_session',
      'format_code',
      'complex_find_replace',
      'merge_conflicts_resolution',
      'bulk_edit_operation',
      'edit_with_context_awareness'
    ];

    // Hybrid operations
    const hybridOperations = [
      'smart_refactor',
      'validate_and_edit',
      'backup_and_edit',
      'atomic_multi_file_edit'
    ];

    if (simpleOperations.includes(operation.type)) {
      return 'simple';
    } else if (complexOperations.includes(operation.type)) {
      return 'complex';
    } else if (hybridOperations.includes(operation.type)) {
      return 'medium';
    }

    // If not explicitly categorized, analyze based on method and params
    let complexityScore = 0;

    // Analyze based on method
    if (operation.method.includes('edit') || operation.method.includes('format')) {
      complexityScore += 0.5;
    }

    // Analyze based on params
    if (operation.params.contextAware || operation.params.advanced) {
      complexityScore += 0.3;
    }

    if (operation.params.regex || operation.params.pattern) {
      complexityScore += 0.2;
    }

    // Determine complexity level based on score
    if (complexityScore < 0.3) {
      return 'simple';
    } else if (complexityScore < 0.7) {
      return 'medium';
    } else {
      return 'complex';
    }
  }

  /**
   * Analyzes the file context of an operation
   */
  private async analyzeFileContext(operation: MCPOperation): Promise<FileContext> {
    const affectedFiles = operation.affectedFiles || [];
    const fileCount = affectedFiles.length;
    const isMultiFile = fileCount > 1;
    
    let totalFileSize = 0;
    let requiresAdvancedFeatures = false;

    // Check if any of the files require advanced features
    for (const filePath of affectedFiles) {
      try {
        const stats = await this.fileSystemManager.getFileStats(filePath);
        totalFileSize += stats.size;

        // Check file extension to determine if it might require advanced features
        const ext = filePath.split('.').pop()?.toLowerCase();
        if (ext && ['rs', 'go', 'cpp', 'c', 'h', 'hpp', 'java'].includes(ext)) {
          requiresAdvancedFeatures = true;
        }
      } catch (error) {
        // File doesn't exist yet, assume it's small
        totalFileSize += 0;
      }
    }

    // Check operation params for advanced features
    if (
      operation.params.syntax ||
      operation.params.formatting ||
      operation.params.indentation ||
      operation.params.contextAware
    ) {
      requiresAdvancedFeatures = true;
    }

    return {
      requiresAdvancedFeatures,
      isMultiFile,
      totalFileSize,
      fileCount
    };
  }

  /**
   * Analyzes the performance requirements of an operation
   */
  private analyzePerformanceRequirements(operation: MCPOperation): PerformanceRequirements {
    const requiresRealTimeResponse = operation.requiresRealTimeResponse || false;
    
    // Determine if the operation is high priority
    const highPriorityOperations = [
      'save_file',
      'emergency_backup',
      'critical_edit'
    ];
    
    const isHighPriority = highPriorityOperations.includes(operation.type) ||
      (operation.params.priority === 'high');

    return {
      requiresRealTimeResponse,
      isHighPriority
    };
  }

  /**
   * Creates an execution plan for an operation
   */
  private createExecutionPlan(
    complexity: ComplexityLevel,
    context: FileContext,
    performance: PerformanceRequirements
  ): OperationPlan {
    // Simple operations with small files go to filesystem
    if (
      complexity === 'simple' &&
      !context.requiresAdvancedFeatures &&
      context.totalFileSize < this.simpleOperationThreshold
    ) {
      return {
        executor: 'filesystem',
        fallback: 'edit'
      };
    }
    
    // Complex operations or those requiring advanced features go to edit
    if (
      complexity === 'complex' ||
      context.requiresAdvancedFeatures
    ) {
      return {
        executor: 'edit',
        preprocessing: 'filesystem'
      };
    }
    
    // Medium complexity operations with multiple files go to hybrid
    if (
      complexity === 'medium' &&
      context.isMultiFile
    ) {
      return {
        executor: 'hybrid',
        coordinationStrategy: 'intelligent'
      };
    }
    
    // Real-time operations with small files go to filesystem
    if (
      performance.requiresRealTimeResponse &&
      context.totalFileSize < this.simpleOperationThreshold
    ) {
      return {
        executor: 'filesystem',
        fallback: 'edit'
      };
    }
    
    // Default to hybrid for medium complexity
    return {
      executor: 'hybrid',
      coordinationStrategy: 'sequential'
    };
  }

  /**
   * Optimizes an operation for execution
   */
  public async optimizeOperation(operation: MCPOperation): Promise<OptimizedOperation> {
    const plan = await this.route(operation);
    
    // For large batch operations, split into smaller batches
    if (operation.affectedFiles.length > 100) {
      return this.createBatchStrategy(operation, plan);
    } else if (operation.requiresRealTimeResponse) {
      return this.createStreamingStrategy(operation, plan);
    }
    
    return {
      original: operation,
      plan
    };
  }

  /**
   * Creates a batch strategy for large operations
   */
  private createBatchStrategy(operation: MCPOperation, plan: OperationPlan): OptimizedOperation {
    const batchSize = 50;
    const batches: MCPOperation[][] = [];
    
    // Split affected files into batches
    for (let i = 0; i < operation.affectedFiles.length; i += batchSize) {
      const batchFiles = operation.affectedFiles.slice(i, i + batchSize);
      
      // Create a new operation for each batch
      const batchOperation: MCPOperation = {
        ...operation,
        affectedFiles: batchFiles
      };
      
      batches.push([batchOperation]);
    }
    
    return {
      original: operation,
      plan: {
        ...plan,
        coordinationStrategy: 'parallel'
      },
      batches
    };
  }

  /**
   * Creates a streaming strategy for real-time operations
   */
  private createStreamingStrategy(operation: MCPOperation, plan: OperationPlan): OptimizedOperation {
    // For streaming operations, we prioritize speed over completeness
    return {
      original: operation,
      plan: {
        ...plan,
        executor: plan.executor === 'hybrid' ? 'filesystem' : plan.executor
      }
    };
  }

  /**
   * Creates a standard strategy for normal operations
   */
  private createStandardStrategy(operation: MCPOperation, plan: OperationPlan): OptimizedOperation {
    return {
      original: operation,
      plan
    };
  }

  /**
   * Executes an operation according to its plan
   */
  public async executeOperation(operation: MCPOperation): Promise<any> {
    const optimized = await this.optimizeOperation(operation);
    const { plan } = optimized;
    
    // If we have batches, execute them according to the coordination strategy
    if (optimized.batches) {
      if (plan.coordinationStrategy === 'parallel') {
        return this.executeParallelBatches(optimized.batches);
      } else {
        return this.executeSequentialBatches(optimized.batches);
      }
    }
    
    // Execute preprocessing if specified
    if (plan.preprocessing) {
      await this.executeWithExecutor(operation, plan.preprocessing);
    }
    
    // Execute the main operation
    try {
      return await this.executeWithExecutor(operation, plan.executor);
    } catch (error) {
      // If we have a fallback and the main executor failed, try the fallback
      if (plan.fallback) {
        console.log(`Main executor ${plan.executor} failed, trying fallback ${plan.fallback}`);
        return await this.executeWithExecutor(operation, plan.fallback);
      }
      
      throw error;
    }
  }

  /**
   * Executes an operation with a specific executor
   */
  private async executeWithExecutor(operation: MCPOperation, executor: ExecutorType): Promise<any> {
    switch (executor) {
      case 'filesystem':
        return this.executeWithFileSystem(operation);
      case 'edit':
        return this.executeWithEdit(operation);
      case 'hybrid':
        return this.executeWithHybrid(operation);
      default:
        throw new Error(`Unknown executor: ${executor}`);
    }
  }

  /**
   * Executes an operation with the file system manager
   */
  private async executeWithFileSystem(operation: MCPOperation): Promise<any> {
    switch (operation.type) {
      case 'read_file_content':
        return this.fileSystemManager.readFile(operation.params.path);
      case 'write_file_content':
        return this.fileSystemManager.writeFile(operation.params.path, operation.params.content);
      case 'append_to_file':
        return this.fileSystemManager.appendFile(operation.params.path, operation.params.content);
      case 'get_file_info':
        return this.fileSystemManager.getFileStats(operation.params.path);
      case 'list_files':
        return this.fileSystemManager.listFiles(operation.params.directory, operation.params.pattern);
      case 'create_directory':
        return this.fileSystemManager.createDirectory(operation.params.path);
      case 'delete_file':
        return this.fileSystemManager.deleteFile(operation.params.path);
      case 'simple_find_replace':
        return this.fileSystemManager.replaceInFile(
          operation.params.path,
          new RegExp(operation.params.pattern, operation.params.flags),
          operation.params.replacement
        );
      default:
        throw new Error(`Unsupported operation type for file system: ${operation.type}`);
    }
  }

  /**
   * Executes an operation with the Edit instance manager
   */
  private async executeWithEdit(operation: MCPOperation): Promise<any> {
    // Create a session for the operation
    const sessionId = await this.editInstanceManager.createEditSession(operation.affectedFiles);
    
    try {
      switch (operation.type) {
        case 'interactive_edit_session':
          // Return the session ID for the client to use
          return { sessionId };
        
        case 'format_code':
          return this.editInstanceManager.executeEditCommand(sessionId, {
            type: 'edit',
            params: {
              action: 'format',
              language: operation.params.language
            }
          });
        
        case 'complex_find_replace':
          return this.editInstanceManager.executeEditCommand(sessionId, {
            type: 'replace',
            params: {
              pattern: operation.params.pattern,
              replacement: operation.params.replacement,
              options: operation.params.options
            }
          });
        
        case 'merge_conflicts_resolution':
          return this.editInstanceManager.performComplexEdit(sessionId, {
            type: 'merge_conflicts',
            params: {
              strategy: operation.params.strategy
            }
          });
        
        case 'bulk_edit_operation':
          return this.editInstanceManager.coordinateMultiFileEdit({
            files: operation.affectedFiles,
            operation: operation.params.operation as EditCommand
          });
        
        case 'edit_with_context_awareness':
          return this.editInstanceManager.performComplexEdit(sessionId, {
            type: 'context_aware_edit',
            params: {
              surroundingFiles: operation.params.surroundingFiles
            }
          });
        
        default:
          throw new Error(`Unsupported operation type for Edit: ${operation.type}`);
      }
    } finally {
      // Close the session unless it's an interactive session
      if (operation.type !== 'interactive_edit_session') {
        await this.editInstanceManager.closeEditSession(sessionId).catch(console.error);
      }
    }
  }

  /**
   * Executes an operation with a hybrid approach
   */
  private async executeWithHybrid(operation: MCPOperation): Promise<any> {
    switch (operation.type) {
      case 'smart_refactor':
        // Use file system to find occurrences, then Edit for precision
        const searchResults = await Promise.all(
          operation.affectedFiles.map(file =>
            this.fileSystemManager.findInFile(
              file,
              new RegExp(operation.params.oldName, 'g')
            )
          )
        );
        
        // If we found occurrences, use Edit to refactor
        const filesToEdit = operation.affectedFiles.filter((file, index) => searchResults[index].length > 0);
        
        if (filesToEdit.length > 0) {
          return this.editInstanceManager.coordinateMultiFileEdit({
            files: filesToEdit,
            operation: {
              type: 'replace',
              params: {
                pattern: operation.params.oldName,
                replacement: operation.params.newName
              }
            }
          });
        }
        
        return { message: 'No occurrences found to refactor' };
      
      case 'validate_and_edit':
        // Validate with file system
        for (const file of operation.affectedFiles) {
          const content = await this.fileSystemManager.readFile(file);
          
          // Apply validation rules
          for (const rule of operation.params.validationRules) {
            if (!new RegExp(rule.pattern).test(content)) {
              throw new Error(`Validation failed for ${file}: ${rule.message}`);
            }
          }
        }
        
        // If validation passes, use Edit for the edits
        return this.executeWithEdit({
          ...operation,
          type: 'bulk_edit_operation'
        });
      
      case 'backup_and_edit':
        // Create backups with file system
        const backups = await Promise.all(
          operation.affectedFiles.map(file =>
            this.fileSystemManager.createBackup(file)
          )
        );
        
        try {
          // Use Edit for the edits
          const result = await this.executeWithEdit({
            ...operation,
            type: operation.params.operation.type
          });
          
          return {
            ...result,
            backups
          };
        } catch (error) {
          // If edits fail, restore backups
          await Promise.all(
            operation.affectedFiles.map((file, index) =>
              this.fileSystemManager.restoreBackup(backups[index], file)
            )
          );
          
          throw error;
        }
      
      case 'atomic_multi_file_edit':
        // Use file system for coordination, Edit for individual files
        const operations = operation.params.operations || [];
        const operationResults = [];
        
        try {
          for (const op of operations) {
            const result = await this.executeOperation(op);
            operationResults.push(result);
          }
          
          return operationResults;
        } catch (error) {
          // If any operation fails, roll back all previous operations
          // This is a simplified approach; in a real implementation, we would need
          // to track the changes and apply inverse operations
          throw error;
        }
      
      default:
        throw new Error(`Unsupported operation type for hybrid: ${operation.type}`);
    }
  }

  /**
   * Executes batches of operations in parallel
   */
  private async executeParallelBatches(batches: MCPOperation[][]): Promise<any[]> {
    const results = await Promise.all(
      batches.map(batch =>
        Promise.all(
          batch.map(operation =>
            this.executeOperation(operation)
          )
        )
      )
    );
    
    return results.flat();
  }

  /**
   * Executes batches of operations sequentially
   */
  private async executeSequentialBatches(batches: MCPOperation[][]): Promise<any[]> {
    const results = [];
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(operation =>
          this.executeOperation(operation)
        )
      );
      
      results.push(...batchResults);
    }
    
    return results;
  }
}