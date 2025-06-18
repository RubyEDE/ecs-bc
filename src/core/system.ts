import { ComponentType } from './component';
import { World } from './world';

/**
 * Forward declaration for World to avoid circular dependency
 */

/**
 * System interface for processing entities with specific components
 */
export interface System {
  readonly name: string;
  readonly id: number;
  readonly componentTypes: ComponentType[];
  
  /**
   * Execute the system logic
   * @param world The world instance
   * @param deltaTime Time elapsed since last update (in seconds)
   */
  execute(world: World, deltaTime: number): void;
  
  /**
   * Optional initialization hook
   * @param world The world instance
   */
  init?(world: World): void;
  
  /**
   * Optional cleanup hook
   * @param world The world instance
   */
  cleanup?(world: World): void;
}

/**
 * System execution priority levels
 */
export enum SystemPriority {
  HIGHEST = 0,
  HIGH = 25,
  NORMAL = 50,
  LOW = 75,
  LOWEST = 100,
  USER = 1000  // User-defined systems start at 1000
}

/**
 * System registration info with metadata
 */
export interface SystemInfo {
  readonly system: System;
  readonly priority: number;
  readonly enabled: boolean;
  readonly executionCount: number;
  readonly totalExecutionTime: number;
  readonly lastExecutionTime: number;
}

/**
 * System scheduler for deterministic system execution
 */
export class SystemScheduler {
  private systems: Map<string, SystemInfo> = new Map();
  private executionOrder: string[] = [];
  private nextSystemId = 0;
  private isRunning = false;
  
  /**
   * Register a system with the scheduler
   * @param system The system to register
   * @param priority Execution priority (lower values execute first)
   * @returns The assigned system ID
   */
  addSystem(system: System, priority: number = SystemPriority.NORMAL): number {
    if (this.systems.has(system.name)) {
      throw new Error(`System '${system.name}' is already registered`);
    }
    
    // Assign ID if system doesn't have one
    const systemId = system.id !== undefined ? system.id : this.nextSystemId++;
    
    // Update the system's ID if needed
    if (system.id === undefined || system.id === 0) {
      (system as any).id = systemId;
    }
    
    const systemInfo: SystemInfo = {
      system: system,
      priority,
      enabled: true,
      executionCount: 0,
      totalExecutionTime: 0,
      lastExecutionTime: 0
    };
    
    this.systems.set(system.name, systemInfo);
    this.updateExecutionOrder();
    
    return systemId;
  }
  
  /**
   * Remove a system from the scheduler
   * @param systemName The name of the system to remove
   */
  removeSystem(systemName: string): void {
    if (!this.systems.has(systemName)) {
      throw new Error(`System '${systemName}' is not registered`);
    }
    
    const systemInfo = this.systems.get(systemName)!;
    
    // Call cleanup hook if present
    if (systemInfo.system.cleanup) {
      // We'll pass world when we execute this
    }
    
    this.systems.delete(systemName);
    this.updateExecutionOrder();
  }
  
  /**
   * Enable or disable a system
   * @param systemName The name of the system
   * @param enabled Whether the system should be enabled
   */
  setSystemEnabled(systemName: string, enabled: boolean): void {
    const systemInfo = this.systems.get(systemName);
    if (!systemInfo) {
      throw new Error(`System '${systemName}' is not registered`);
    }
    
    (systemInfo as any).enabled = enabled;
  }
  
  /**
   * Get system information
   * @param systemName The name of the system
   * @returns System info or undefined if not found
   */
  getSystemInfo(systemName: string): SystemInfo | undefined {
    return this.systems.get(systemName);
  }
  
  /**
   * Get all registered systems
   * @returns Array of system info sorted by execution order
   */
  getAllSystems(): SystemInfo[] {
    return this.executionOrder
      .map(name => this.systems.get(name)!)
      .filter(info => info !== undefined);
  }
  
  /**
   * Execute all enabled systems in priority order
   * @param world The world instance
   * @param deltaTime Time elapsed since last update
   */
  executeSystems(world: World, deltaTime: number): void {
    if (this.isRunning) {
      throw new Error('Systems are already running (recursive execution detected)');
    }
    
    this.isRunning = true;
    
    try {
      for (const systemName of this.executionOrder) {
        const systemInfo = this.systems.get(systemName)!;
        
        if (!systemInfo.enabled) {
          continue;
        }
        
        const startTime = performance.now();
        
        try {
          systemInfo.system.execute(world, deltaTime);
        } catch (error) {
          console.error(`Error executing system '${systemName}':`, error);
          // Continue with other systems
        }
        
        const endTime = performance.now();
        const executionTime = endTime - startTime;
        
        // Update performance metrics
        (systemInfo as any).executionCount++;
        (systemInfo as any).totalExecutionTime += executionTime;
        (systemInfo as any).lastExecutionTime = executionTime;
      }
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * Initialize all systems
   * @param world The world instance
   */
  initializeSystems(world: World): void {
    for (const systemInfo of this.systems.values()) {
      if (systemInfo.system.init) {
        try {
          systemInfo.system.init(world);
        } catch (error) {
          console.error(`Error initializing system '${systemInfo.system.name}':`, error);
        }
      }
    }
  }
  
  /**
   * Cleanup all systems
   * @param world The world instance
   */
  cleanupSystems(world: World): void {
    for (const systemInfo of this.systems.values()) {
      if (systemInfo.system.cleanup) {
        try {
          systemInfo.system.cleanup(world);
        } catch (error) {
          console.error(`Error cleaning up system '${systemInfo.system.name}':`, error);
        }
      }
    }
  }
  
  /**
   * Get performance statistics for all systems
   * @returns Performance stats
   */
  getPerformanceStats(): Map<string, {
    executionCount: number;
    totalTime: number;
    averageTime: number;
    lastTime: number;
  }> {
    const stats = new Map();
    
    for (const [name, info] of this.systems) {
      stats.set(name, {
        executionCount: info.executionCount,
        totalTime: info.totalExecutionTime,
        averageTime: info.executionCount > 0 ? info.totalExecutionTime / info.executionCount : 0,
        lastTime: info.lastExecutionTime
      });
    }
    
    return stats;
  }
  
  /**
   * Clear all systems
   */
  clear(): void {
    this.systems.clear();
    this.executionOrder = [];
    this.nextSystemId = 0;
  }
  
  /**
   * Update the execution order based on system priorities and names
   * Systems are sorted by priority (ascending), then by name (ascending) for determinism
   */
  private updateExecutionOrder(): void {
    this.executionOrder = Array.from(this.systems.entries())
      .sort(([nameA, infoA], [nameB, infoB]) => {
        // First sort by priority
        if (infoA.priority !== infoB.priority) {
          return infoA.priority - infoB.priority;
        }
        // Then sort by name for deterministic order
        return nameA.localeCompare(nameB);
      })
      .map(([name]) => name);
  }
}

/**
 * Base system class with common functionality
 */
export abstract class BaseSystem implements System {
  readonly name: string;
  readonly id: number;
  readonly componentTypes: ComponentType[];
  
  constructor(name: string, componentTypes: ComponentType[], id?: number) {
    this.name = name;
    this.componentTypes = [...componentTypes];
    this.id = id ?? 0; // Will be assigned by scheduler if 0
  }
  
  /**
   * Abstract execute method to be implemented by concrete systems
   */
  abstract execute(world: World, deltaTime: number): void;
  
  /**
   * Optional initialization hook
   */
  init?(world: World): void;
  
  /**
   * Optional cleanup hook
   */
  cleanup?(world: World): void;
} 