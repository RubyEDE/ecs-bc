import { World } from './world';
import { System } from './system';
import { ComponentType, componentRegistry } from './component';
import { enhancedComponentRegistry, ComponentAccessPermissions } from './component-registry';
import { EnhancedSystem } from './enhanced-system';

/**
 * Migration plan for converting a system
 */
export interface SystemMigrationPlan {
  systemName: string;
  componentsToMigrate: ComponentMigrationInfo[];
  estimatedChanges: number;
  warnings: string[];
  suggestedPermissions: Record<string, ComponentAccessPermissions>;
}

/**
 * Component migration information
 */
export interface ComponentMigrationInfo {
  originalName: string;
  newUniqueName: string;
  usageCount: number;
  accessPatterns: ComponentAccessPattern[];
  requiresRefactoring: boolean;
}

/**
 * Component access patterns detected in existing code
 */
export interface ComponentAccessPattern {
  systemName: string;
  operationType: 'read' | 'write' | 'create' | 'delete';
  frequency: number;
  locations: string[];
}

/**
 * Migration helper for converting existing systems to ownership-based approach
 */
export class SystemMigrationHelper {
  private migrationLog: string[] = [];

  /**
   * Analyze existing system and create migration plan
   */
  analyzeSystemForMigration(system: System, world: World): SystemMigrationPlan {
    const plan: SystemMigrationPlan = {
      systemName: system.name,
      componentsToMigrate: [],
      estimatedChanges: 0,
      warnings: [],
      suggestedPermissions: {}
    };

    // Analyze component types used by the system
    for (const componentType of system.componentTypes) {
      const migrationInfo = this.analyzeComponentUsage(componentType, system.name, world);
      plan.componentsToMigrate.push(migrationInfo);
      
      if (migrationInfo.requiresRefactoring) {
        plan.estimatedChanges += migrationInfo.usageCount;
      }

      // Suggest permissions based on access patterns
      const permissions = this.suggestPermissions(migrationInfo);
      plan.suggestedPermissions[componentType.name] = permissions;
    }

    // Add warnings for potential issues
    this.addMigrationWarnings(plan);

    return plan;
  }

  /**
   * Migrate existing components to enhanced registry
   */
  migrateSystemComponents(
    system: System,
    migrationPlan: SystemMigrationPlan,
    customPermissions?: Record<string, Partial<ComponentAccessPermissions>>
  ): Map<string, ComponentType> {
    const migratedComponents = new Map<string, ComponentType>();

    for (const componentInfo of migrationPlan.componentsToMigrate) {
      const originalComponentType = componentRegistry.getType(componentInfo.originalName);
      if (!originalComponentType) {
        this.log(`Warning: Component '${componentInfo.originalName}' not found in registry`);
        continue;
      }

      // Use custom permissions if provided, otherwise use suggested permissions
      const permissions = customPermissions?.[componentInfo.originalName] || 
                         migrationPlan.suggestedPermissions[componentInfo.originalName];

      try {
        const newComponentType = enhancedComponentRegistry.registerComponent(
          componentInfo.originalName,
          originalComponentType.constructor,
          system.name,
          permissions
        );

        migratedComponents.set(componentInfo.originalName, newComponentType);
        this.log(`Migrated component '${componentInfo.originalName}' to '${newComponentType.name}'`);
      } catch (error) {
        this.log(`Error migrating component '${componentInfo.originalName}': ${error}`);
      }
    }

    return migratedComponents;
  }

  /**
   * Convert legacy system to enhanced system
   */
  convertToEnhancedSystem(
    LegacySystemClass: new (...args: any[]) => System,
    migrationPlan: SystemMigrationPlan
  ): typeof EnhancedSystem {
    const migrationHelper = this;

    return class MigratedSystem extends EnhancedSystem {
      private legacySystem: System;
      private componentMappings = new Map<string, ComponentType>();

      constructor(...args: any[]) {
        super(migrationPlan.systemName, [], undefined);
        this.legacySystem = new LegacySystemClass(...args);
        
        // Register components during construction
        this.initializeComponents(migrationPlan);
      }

      private initializeComponents(plan: SystemMigrationPlan): void {
        for (const componentInfo of plan.componentsToMigrate) {
          const originalType = componentRegistry.getType(componentInfo.originalName);
          if (originalType) {
            const permissions = plan.suggestedPermissions[componentInfo.originalName];
            const newType = this.registerOwnedComponent(
              componentInfo.originalName,
              originalType.constructor,
              permissions
            );
            this.componentMappings.set(componentInfo.originalName, newType);
          }
        }
      }

      execute(world: World, deltaTime: number): void {
        try {
          // Wrap legacy system execution with access control
          this.executeLegacySystemSafely(world, deltaTime);
        } catch (error) {
          migrationHelper.log(`Error in migrated system '${this.name}': ${error}`);
          throw error;
        }
      }

      private executeLegacySystemSafely(world: World, deltaTime: number): void {
        // This is a simplified approach - in reality, you'd need to intercept
        // all world operations and route them through the safe methods
        
        // For now, just call the legacy execute method
        // A full implementation would require hooking into world operations
        if (this.legacySystem.execute) {
          this.legacySystem.execute(world, deltaTime);
        }
      }

      // Provide backward compatibility methods
      getComponentMapping(originalName: string): ComponentType | undefined {
        return this.componentMappings.get(originalName);
      }
    };
  }

  /**
   * Create access control wrapper for existing world operations
   */
  createAccessControlWrapper(world: World, system: EnhancedSystem): WorldAccessWrapper {
    return new WorldAccessWrapper(world, system);
  }

  /**
   * Generate migration report
   */
  generateMigrationReport(plans: SystemMigrationPlan[]): string {
    let report = '# ECS Migration Report\n\n';
    
    report += `## Summary\n`;
    report += `- Systems to migrate: ${plans.length}\n`;
    report += `- Total estimated changes: ${plans.reduce((sum, plan) => sum + plan.estimatedChanges, 0)}\n`;
    report += `- Total warnings: ${plans.reduce((sum, plan) => sum + plan.warnings.length, 0)}\n\n`;

    for (const plan of plans) {
      report += `## System: ${plan.systemName}\n`;
      report += `- Components to migrate: ${plan.componentsToMigrate.length}\n`;
      report += `- Estimated changes: ${plan.estimatedChanges}\n`;
      
      if (plan.warnings.length > 0) {
        report += `### Warnings:\n`;
        for (const warning of plan.warnings) {
          report += `- ${warning}\n`;
        }
      }

      report += `### Components:\n`;
      for (const component of plan.componentsToMigrate) {
        report += `- **${component.originalName}** → ${component.newUniqueName}\n`;
        report += `  - Usage count: ${component.usageCount}\n`;
        report += `  - Requires refactoring: ${component.requiresRefactoring ? 'Yes' : 'No'}\n`;
      }
      report += '\n';
    }

    return report;
  }

  /**
   * Get migration log
   */
  getMigrationLog(): string[] {
    return [...this.migrationLog];
  }

  /**
   * Clear migration log
   */
  clearMigrationLog(): void {
    this.migrationLog = [];
  }

  // Private helper methods

  private analyzeComponentUsage(
    componentType: ComponentType,
    systemName: string,
    world: World
  ): ComponentMigrationInfo {
    // This is a simplified analysis - in practice, you'd need to analyze
    // the actual system code to determine usage patterns
    
    const systemUniqueId = enhancedComponentRegistry.getSystemUniqueId(systemName) || 'SYS001';
    
    return {
      originalName: componentType.name,
      newUniqueName: `${componentType.name}_${systemUniqueId}`,
      usageCount: 1, // Simplified - would need code analysis
      accessPatterns: [
        {
          systemName,
          operationType: 'read',
          frequency: 1,
          locations: ['execute method'] // Simplified
        }
      ],
      requiresRefactoring: true // Conservative assumption
    };
  }

  private suggestPermissions(migrationInfo: ComponentMigrationInfo): ComponentAccessPermissions {
    // Default permissions - read access for all, write access for owner
    return {
      read: [],
      write: [], // Will be filled by the owner system
      readAll: true
    };
  }

  private addMigrationWarnings(plan: SystemMigrationPlan): void {
    if (plan.componentsToMigrate.length === 0) {
      plan.warnings.push('No components found to migrate');
    }

    if (plan.estimatedChanges > 10) {
      plan.warnings.push('High number of estimated changes - consider gradual migration');
    }

    // Check for potential naming conflicts
    const componentNames = plan.componentsToMigrate.map(c => c.originalName);
    const duplicates = componentNames.filter((name, index) => componentNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      plan.warnings.push(`Potential naming conflicts: ${duplicates.join(', ')}`);
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.migrationLog.push(`[${timestamp}] ${message}`);
    console.log(`[Migration] ${message}`);
  }
}

/**
 * Wrapper class to provide access-controlled world operations
 */
class WorldAccessWrapper {
  constructor(
    private world: World,
    private system: EnhancedSystem
  ) {}

  // Wrap world methods with access control
  // This is a simplified example - you'd need to wrap all relevant methods

  createEntity() {
    return (this.system as any).createOwnedEntity(this.world);
  }

  addComponent<T>(entity: any, componentName: string, component: T) {
    return (this.system as any).addComponentSafe(this.world, entity, componentName, component);
  }

  getComponent<T>(entity: any, componentName: string): T | undefined {
    return (this.system as any).getComponentSafe(this.world, entity, componentName);
  }

  // Add more wrapped methods as needed...
}

/**
 * Global migration helper instance
 */
export const migrationHelper = new SystemMigrationHelper(); 