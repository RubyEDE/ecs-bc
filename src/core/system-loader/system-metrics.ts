import { SystemId, SystemMetrics, ResourceUsage, ExecutionTrace } from '../types';

/**
 * System performance monitoring and metrics collection
 */
export class SystemMetricsCollector {
  private systemMetrics = new Map<SystemId, SystemMetrics>();
  private executionTraces = new Map<SystemId, ExecutionTrace[]>();
  private maxTraceHistory = 1000; // Keep last 1000 traces per system
  private isTracingEnabled = false;

  /**
   * Initialize metrics for a new system
   */
  initializeSystem(systemId: SystemId): void {
    this.systemMetrics.set(systemId, {
      executionCount: 0,
      totalExecutionTime: 0,
      averageExecutionTime: 0,
      gasUsed: 0,
      entitiesCreated: 0,
      componentsCreated: 0,
      memoryUsage: 0,
      errorCount: 0,
      lastExecutionTime: 0,
    });

    this.executionTraces.set(systemId, []);
  }

  /**
   * Record system execution metrics
   */
  recordExecution(
    systemId: SystemId,
    executionTime: number,
    gasUsed: number,
    success: boolean,
    error?: string
  ): void {
    const metrics = this.systemMetrics.get(systemId);
    if (!metrics) {
      this.initializeSystem(systemId);
      return this.recordExecution(systemId, executionTime, gasUsed, success, error);
    }

    // Update execution metrics
    metrics.executionCount++;
    metrics.totalExecutionTime += executionTime;
    metrics.averageExecutionTime = metrics.totalExecutionTime / metrics.executionCount;
    metrics.gasUsed += gasUsed;
    metrics.lastExecutionTime = Date.now();

    // Record errors
    if (!success) {
      metrics.errorCount++;
      metrics.lastError = error;
    }

    // Record trace if enabled
    if (this.isTracingEnabled) {
      this.addTrace(systemId, {
        timestamp: Date.now(),
        operation: 'system_execution',
        systemId,
        gasUsed,
        duration: executionTime,
        success,
        error,
      });
    }
  }

  /**
   * Record entity creation
   */
  recordEntityCreation(systemId: SystemId, entityId: number, gasUsed: number): void {
    const metrics = this.systemMetrics.get(systemId);
    if (metrics) {
      metrics.entitiesCreated++;
    }

    if (this.isTracingEnabled) {
      this.addTrace(systemId, {
        timestamp: Date.now(),
        operation: 'create_entity',
        systemId,
        entityId,
        gasUsed,
        duration: 0,
        success: true,
      });
    }
  }

  /**
   * Record component creation
   */
  recordComponentCreation(systemId: SystemId, componentId: number, gasUsed: number): void {
    const metrics = this.systemMetrics.get(systemId);
    if (metrics) {
      metrics.componentsCreated++;
    }

    if (this.isTracingEnabled) {
      this.addTrace(systemId, {
        timestamp: Date.now(),
        operation: 'create_component',
        systemId,
        componentId,
        gasUsed,
        duration: 0,
        success: true,
      });
    }
  }

  /**
   * Record component operation
   */
  recordComponentOperation(
    systemId: SystemId,
    operation: string,
    entityId: number,
    componentId: number,
    gasUsed: number,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    if (this.isTracingEnabled) {
      this.addTrace(systemId, {
        timestamp: Date.now(),
        operation,
        systemId,
        entityId,
        componentId,
        gasUsed,
        duration,
        success,
        error,
      });
    }
  }

  /**
   * Update memory usage for a system
   */
  updateMemoryUsage(systemId: SystemId, memoryUsageMB: number): void {
    const metrics = this.systemMetrics.get(systemId);
    if (metrics) {
      metrics.memoryUsage = memoryUsageMB;
    }
  }

  /**
   * Get metrics for a system
   */
  getSystemMetrics(systemId: SystemId): SystemMetrics | undefined {
    return this.systemMetrics.get(systemId);
  }

  /**
   * Get current resource usage for a system
   */
  getResourceUsage(systemId: SystemId): ResourceUsage {
    const metrics = this.systemMetrics.get(systemId);
    if (!metrics) {
      return {
        entitiesCreated: 0,
        componentsCreated: 0,
        memoryUsageMB: 0,
        gasUsed: 0,
        executionTimeMs: 0,
      };
    }

    return {
      entitiesCreated: metrics.entitiesCreated,
      componentsCreated: metrics.componentsCreated,
      memoryUsageMB: metrics.memoryUsage,
      gasUsed: metrics.gasUsed,
      executionTimeMs: metrics.totalExecutionTime,
    };
  }

  /**
   * Get execution traces for a system
   */
  getExecutionTraces(systemId: SystemId): ExecutionTrace[] {
    return this.executionTraces.get(systemId) || [];
  }

  /**
   * Get recent execution traces (last N traces)
   */
  getRecentTraces(systemId: SystemId, count: number = 100): ExecutionTrace[] {
    const traces = this.executionTraces.get(systemId) || [];
    return traces.slice(-count);
  }

  /**
   * Get traces filtered by operation type
   */
  getTracesByOperation(systemId: SystemId, operation: string): ExecutionTrace[] {
    const traces = this.executionTraces.get(systemId) || [];
    return traces.filter(trace => trace.operation === operation);
  }

  /**
   * Get error traces for a system
   */
  getErrorTraces(systemId: SystemId): ExecutionTrace[] {
    const traces = this.executionTraces.get(systemId) || [];
    return traces.filter(trace => !trace.success);
  }

  /**
   * Get performance summary for a system
   */
  getPerformanceSummary(systemId: SystemId): {
    metrics: SystemMetrics;
    resourceUsage: ResourceUsage;
    recentErrors: ExecutionTrace[];
    performanceIssues: string[];
  } {
    const metrics = this.getSystemMetrics(systemId);
    const resourceUsage = this.getResourceUsage(systemId);
    const recentErrors = this.getErrorTraces(systemId).slice(-10);
    const performanceIssues: string[] = [];

    if (metrics) {
      // Identify performance issues
      if (metrics.averageExecutionTime > 100) {
        performanceIssues.push(`High average execution time: ${metrics.averageExecutionTime.toFixed(2)}ms`);
      }

      if (metrics.errorCount > 0) {
        const errorRate = (metrics.errorCount / metrics.executionCount) * 100;
        if (errorRate > 5) {
          performanceIssues.push(`High error rate: ${errorRate.toFixed(1)}%`);
        }
      }

      if (resourceUsage.memoryUsageMB > 100) {
        performanceIssues.push(`High memory usage: ${resourceUsage.memoryUsageMB}MB`);
      }

      if (resourceUsage.gasUsed > 1000000) {
        performanceIssues.push(`High gas usage: ${resourceUsage.gasUsed}`);
      }
    }

    return {
      metrics: metrics || this.createEmptyMetrics(),
      resourceUsage,
      recentErrors,
      performanceIssues,
    };
  }

  /**
   * Get system rankings by performance metrics
   */
  getSystemRankings(): {
    byExecutionCount: Array<{ systemId: SystemId; count: number }>;
    byExecutionTime: Array<{ systemId: SystemId; avgTime: number }>;
    byErrorRate: Array<{ systemId: SystemId; errorRate: number }>;
    byGasUsage: Array<{ systemId: SystemId; gasUsed: number }>;
  } {
    const systems = Array.from(this.systemMetrics.entries());

    const byExecutionCount = systems
      .map(([systemId, metrics]) => ({ systemId, count: metrics.executionCount }))
      .sort((a, b) => b.count - a.count);

    const byExecutionTime = systems
      .map(([systemId, metrics]) => ({ systemId, avgTime: metrics.averageExecutionTime }))
      .sort((a, b) => a.avgTime - b.avgTime);

    const byErrorRate = systems
      .map(([systemId, metrics]) => ({
        systemId,
        errorRate: metrics.executionCount > 0 ? (metrics.errorCount / metrics.executionCount) * 100 : 0,
      }))
      .sort((a, b) => a.errorRate - b.errorRate);

    const byGasUsage = systems
      .map(([systemId, metrics]) => ({ systemId, gasUsed: metrics.gasUsed }))
      .sort((a, b) => b.gasUsed - a.gasUsed);

    return {
      byExecutionCount,
      byExecutionTime,
      byErrorRate,
      byGasUsage,
    };
  }

  /**
   * Enable or disable execution tracing
   */
  setTracingEnabled(enabled: boolean): void {
    this.isTracingEnabled = enabled;
  }

  /**
   * Clear traces for a system
   */
  clearTraces(systemId: SystemId): void {
    this.executionTraces.set(systemId, []);
  }

  /**
   * Clear all traces
   */
  clearAllTraces(): void {
    for (const systemId of this.executionTraces.keys()) {
      this.executionTraces.set(systemId, []);
    }
  }

  /**
   * Remove system metrics
   */
  removeSystem(systemId: SystemId): void {
    this.systemMetrics.delete(systemId);
    this.executionTraces.delete(systemId);
  }

  /**
   * Get overall statistics
   */
  getOverallStats(): {
    totalSystems: number;
    totalExecutions: number;
    totalExecutionTime: number;
    totalGasUsed: number;
    totalErrors: number;
    averageSystemPerformance: number;
  } {
    let totalExecutions = 0;
    let totalExecutionTime = 0;
    let totalGasUsed = 0;
    let totalErrors = 0;
    let totalAvgTime = 0;

    for (const metrics of this.systemMetrics.values()) {
      totalExecutions += metrics.executionCount;
      totalExecutionTime += metrics.totalExecutionTime;
      totalGasUsed += metrics.gasUsed;
      totalErrors += metrics.errorCount;
      totalAvgTime += metrics.averageExecutionTime;
    }

    const systemCount = this.systemMetrics.size;
    const averageSystemPerformance = systemCount > 0 ? totalAvgTime / systemCount : 0;

    return {
      totalSystems: systemCount,
      totalExecutions,
      totalExecutionTime,
      totalGasUsed,
      totalErrors,
      averageSystemPerformance,
    };
  }

  /**
   * Add execution trace
   */
  private addTrace(systemId: SystemId, trace: ExecutionTrace): void {
    const traces = this.executionTraces.get(systemId) || [];
    traces.push(trace);

    // Keep only the last N traces to prevent memory issues
    if (traces.length > this.maxTraceHistory) {
      traces.splice(0, traces.length - this.maxTraceHistory);
    }

    this.executionTraces.set(systemId, traces);
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): SystemMetrics {
    return {
      executionCount: 0,
      totalExecutionTime: 0,
      averageExecutionTime: 0,
      gasUsed: 0,
      entitiesCreated: 0,
      componentsCreated: 0,
      memoryUsage: 0,
      errorCount: 0,
      lastExecutionTime: 0,
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.systemMetrics.clear();
    this.executionTraces.clear();
  }
}

/**
 * Global system metrics collector instance
 */
export const systemMetricsCollector = new SystemMetricsCollector(); 