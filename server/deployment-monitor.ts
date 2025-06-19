import { World } from '../src/core/world';
import { componentRegistry } from '../src/core/component';
import { deploymentTracker, ComponentDefinition, EntityInfo, SystemId } from './deployment-tracker';
import { ComponentRegistration, EntityId } from '../src/core/types';

export interface MonitoringSession {
  systemId: SystemId;
  isActive: boolean;
  initialComponentCount: number;
  initialEntityCount: number;
}

/**
 * Monitors component and entity creation during system deployment
 */
export class DeploymentMonitor {
  private activeSessions = new Map<SystemId, MonitoringSession>();
  private originalCreateEntity: (this: World) => any;
  private originalAddComponent: (this: World, ...args: any[]) => void;

  constructor(private world: World) {
    // Store original methods
    this.originalCreateEntity = this.world.createEntity.bind(this.world);
    this.originalAddComponent = this.world.addComponent.bind(this.world);
  }

  /**
   * Start monitoring for a system deployment
   */
  startMonitoring(systemId: SystemId): void {
    const session: MonitoringSession = {
      systemId,
      isActive: true,
      initialComponentCount: componentRegistry.getAllTypes().length,
      initialEntityCount: this.world.getAllEntities().length
    };

    this.activeSessions.set(systemId, session);

    // Patch World methods to track creation
    this.patchWorldMethods();
  }

  /**
   * Stop monitoring for a system deployment
   */
  stopMonitoring(systemId: SystemId): void {
    const session = this.activeSessions.get(systemId);
    if (session) {
      session.isActive = false;
      this.activeSessions.delete(systemId);
    }

    // Restore original methods if no active sessions
    if (this.activeSessions.size === 0) {
      this.restoreWorldMethods();
    }
  }

  /**
   * Capture current state after deployment
   */
  captureDeploymentState(systemId: SystemId, systemName: string): void {
    const session = this.activeSessions.get(systemId);
    if (!session) return;

    // Capture new components
    this.captureNewComponents(systemId, session);
    
    // Capture new entities (this is tricky without modifying ECS core)
    this.captureNewEntities(systemId, session);
  }

  private captureNewComponents(systemId: SystemId, session: MonitoringSession): void {
    const currentComponents = componentRegistry.getAllTypes();
    
    // Get components created since monitoring started
    for (let i = session.initialComponentCount; i < currentComponents.length; i++) {
      const componentType = currentComponents[i];
      
      // Create a basic component definition
      // Note: Without access to the actual schema, we'll use a placeholder
      const componentDef: ComponentDefinition = {
        name: componentType.name,
        version: 1, // Default version
        schema: {
          version: 1,
          fields: {}, // Would need ECS core modification to get actual schema
          constraints: []
        }
      };

      deploymentTracker.trackComponent(systemId, componentDef);
    }
  }

  private captureNewEntities(systemId: SystemId, session: MonitoringSession): void {
    const currentEntities = this.world.getAllEntities();
    
    // Get entities created since monitoring started
    for (let i = session.initialEntityCount; i < currentEntities.length; i++) {
      const entity = currentEntities[i];
      
      // Get entity components
      const components: Record<string, any> = {};
      const allComponentTypes = componentRegistry.getAllTypes();
      
      for (const componentType of allComponentTypes) {
        const component = this.world.getComponent(entity, componentType);
        if (component) {
          components[componentType.name] = component;
        }
      }

      const entityInfo: EntityInfo = {
        entityId: entity.id,
        owner: systemId,
        components
      };

      deploymentTracker.trackEntity(systemId, entityInfo);
    }
  }

  private patchWorldMethods(): void {
    // Patch createEntity
    this.world.createEntity = (() => {
      const entity = this.originalCreateEntity.call(this.world);
      // Entity creation tracking is handled in captureNewEntities
      return entity;
    }).bind(this.world);

    // Patch addComponent - more complex since it's overloaded
    this.world.addComponent = ((...args: any[]) => {
      const result = this.originalAddComponent.apply(this.world, args);
      // Component addition tracking is handled in captureNewEntities
      return result;
    }).bind(this.world);
  }

  private restoreWorldMethods(): void {
    this.world.createEntity = this.originalCreateEntity;
    this.world.addComponent = this.originalAddComponent;
  }

  /**
   * Get active monitoring sessions
   */
  getActiveSessions(): SystemId[] {
    return Array.from(this.activeSessions.keys());
  }
}

let deploymentMonitor: DeploymentMonitor | null = null;

/**
 * Initialize the deployment monitor with a World instance
 */
export function initializeMonitor(world: World): DeploymentMonitor {
  if (!deploymentMonitor) {
    deploymentMonitor = new DeploymentMonitor(world);
  }
  return deploymentMonitor;
}

/**
 * Get the deployment monitor instance
 */
export function getMonitor(): DeploymentMonitor | null {
  return deploymentMonitor;
} 