import { BaseSystem, System } from './system';
import { ComponentType } from './component';
import { World } from './world';
import { Entity } from './entity';
import { 
  enhancedComponentRegistry, 
  ComponentRegistration, 
  ComponentAccessPermissions 
} from './component-registry';
import { OwnershipComponent, OwnershipComponentType } from './components/ownership-component';

/**
 * Enhanced system operations context
 */
export interface SystemOperationContext {
  systemId: string;
  operation: 'read' | 'write' | 'create' | 'destroy';
  componentName?: string;
  entityId?: number;
  timestamp: number;
}

/**
 * Access violation error with context
 */
export class ComponentAccessViolationError extends Error {
  constructor(
    message: string,
    public context: SystemOperationContext,
    public suggestedAction?: string
  ) {
    super(message);
    this.name = 'ComponentAccessViolationError';
  }
}

/**
 * Enhanced system base class with ownership-aware operations
 */
export abstract class EnhancedSystem extends BaseSystem {
  protected ownedComponents = new Map<string, ComponentType>();
  protected accessibleComponents = new Map<string, ComponentType>();

  constructor(name: string, componentTypes: ComponentType[] = [], id?: number) {
    super(name, componentTypes, id);
  }

  /**
   * Register a component type with this system as owner
   */
  protected registerOwnedComponent<T>(
    originalName: string,
    constructor: new (...args: any[]) => T,
    accessPermissions?: Partial<ComponentAccessPermissions>
  ): ComponentType<T> {
    const componentType = enhancedComponentRegistry.registerComponent(
      originalName,
      constructor,
      this.name,
      accessPermissions
    );

    this.ownedComponents.set(originalName, componentType);
    return componentType;
  }

  /**
   * Get a component type by original name (checks ownership and access)
   */
  protected getComponentType(originalName: string): ComponentType | undefined {
    // Check if we own this component
    const ownedComponent = this.ownedComponents.get(originalName);
    if (ownedComponent) {
      return ownedComponent;
    }

    // Check if we have cached access to this component
    const cachedComponent = this.accessibleComponents.get(originalName);
    if (cachedComponent) {
      return cachedComponent;
    }

    // Try to get component from registry
    const componentType = enhancedComponentRegistry.getComponentByOriginalName(originalName, this.name);
    if (componentType) {
      this.accessibleComponents.set(originalName, componentType);
      return componentType;
    }

    return undefined;
  }

  /**
   * Create an entity with ownership
   */
  protected createOwnedEntity(world: World, metadata?: Record<string, any>): Entity {
    const entity = world.createEntity();
    
    // Add ownership component
    const ownership = new OwnershipComponent(entity.id, undefined, Date.now(), true);
    world.addComponent(entity, OwnershipComponentType, ownership);

    return entity;
  }

  /**
   * Add component to entity with access control
   */
  protected addComponentSafe<T>(
    world: World,
    entity: Entity,
    componentName: string,
    component: T
  ): void {
    const componentType = this.getComponentType(componentName);
    if (!componentType) {
      throw new ComponentAccessViolationError(
        `Component '${componentName}' not found or not accessible`,
        {
          systemId: this.name,
          operation: 'write',
          componentName,
          entityId: entity.id,
          timestamp: Date.now()
        },
        `Register the component or request access from the owner system`
      );
    }

    // Check write access
    const registration = enhancedComponentRegistry.getComponentByUniqueName(componentType.name);
    if (registration) {
      const accessResult = enhancedComponentRegistry.checkWriteAccess(registration, this.name);
      if (!accessResult.allowed) {
        throw new ComponentAccessViolationError(
          accessResult.reason || 'Write access denied',
          {
            systemId: this.name,
            operation: 'write',
            componentName,
            entityId: entity.id,
            timestamp: Date.now()
          },
          accessResult.suggestedAction
        );
      }
    }

    world.addComponent(entity, componentType, component);
  }

  /**
   * Get component from entity with access control
   */
  protected getComponentSafe<T>(
    world: World,
    entity: Entity,
    componentName: string
  ): T | undefined {
    const componentType = this.getComponentType(componentName);
    if (!componentType) {
      throw new ComponentAccessViolationError(
        `Component '${componentName}' not found or not accessible`,
        {
          systemId: this.name,
          operation: 'read',
          componentName,
          entityId: entity.id,
          timestamp: Date.now()
        },
        `Register the component or request access from the owner system`
      );
    }

    // Check read access
    const registration = enhancedComponentRegistry.getComponentByUniqueName(componentType.name);
    if (registration) {
      const accessResult = enhancedComponentRegistry.checkReadAccess(registration, this.name);
      if (!accessResult.allowed) {
        throw new ComponentAccessViolationError(
          accessResult.reason || 'Read access denied',
          {
            systemId: this.name,
            operation: 'read',
            componentName,
            entityId: entity.id,
            timestamp: Date.now()
          },
          accessResult.suggestedAction
        );
      }
    }

    return world.getComponent(entity, componentType);
  }

  /**
   * Update component with access control
   */
  protected updateComponentSafe<T>(
    world: World,
    entity: Entity,
    componentName: string,
    updateFn: (component: T) => void
  ): boolean {
    const componentType = this.getComponentType(componentName);
    if (!componentType) {
      throw new ComponentAccessViolationError(
        `Component '${componentName}' not found or not accessible`,
        {
          systemId: this.name,
          operation: 'write',
          componentName,
          entityId: entity.id,
          timestamp: Date.now()
        }
      );
    }

    // Check write access
    const registration = enhancedComponentRegistry.getComponentByUniqueName(componentType.name);
    if (registration) {
      const accessResult = enhancedComponentRegistry.checkWriteAccess(registration, this.name);
      if (!accessResult.allowed) {
        throw new ComponentAccessViolationError(
          accessResult.reason || 'Write access denied',
          {
            systemId: this.name,
            operation: 'write',
            componentName,
            entityId: entity.id,
            timestamp: Date.now()
          },
          accessResult.suggestedAction
        );
      }
    }

    const component = world.getComponent<T>(entity, componentType);
    if (component) {
      updateFn(component);
      return true;
    }

    return false;
  }

  /**
   * Remove component with access control
   */
  protected removeComponentSafe(
    world: World,
    entity: Entity,
    componentName: string
  ): void {
    const componentType = this.getComponentType(componentName);
    if (!componentType) {
      throw new ComponentAccessViolationError(
        `Component '${componentName}' not found or not accessible`,
        {
          systemId: this.name,
          operation: 'write',
          componentName,
          entityId: entity.id,
          timestamp: Date.now()
        }
      );
    }

    // Check write access
    const registration = enhancedComponentRegistry.getComponentByUniqueName(componentType.name);
    if (registration) {
      const accessResult = enhancedComponentRegistry.checkWriteAccess(registration, this.name);
      if (!accessResult.allowed) {
        throw new ComponentAccessViolationError(
          accessResult.reason || 'Write access denied',
          {
            systemId: this.name,
            operation: 'write',
            componentName,
            entityId: entity.id,
            timestamp: Date.now()
          },
          accessResult.suggestedAction
        );
      }
    }

    world.removeComponent(entity, componentType);
  }

  /**
   * Check if entity is owned by this system
   */
  protected isEntityOwned(world: World, entity: Entity): boolean {
    const ownership = world.getComponent(entity, OwnershipComponentType);
    return ownership ? ownership.ownerId === entity.id : false;
  }

  /**
   * Query components with access control
   */
  protected querySafe(
    world: World,
    ...componentNames: readonly string[]
  ): any {
    const componentTypes: ComponentType[] = [];

    for (const name of componentNames) {
      const componentType = this.getComponentType(name);
      if (!componentType) {
        throw new ComponentAccessViolationError(
          `Component '${name}' not found or not accessible`,
          {
            systemId: this.name,
            operation: 'read',
            componentName: name,
            timestamp: Date.now()
          }
        );
      }

      // Check read access
      const registration = enhancedComponentRegistry.getComponentByUniqueName(componentType.name);
      if (registration) {
        const accessResult = enhancedComponentRegistry.checkReadAccess(registration, this.name);
        if (!accessResult.allowed) {
          throw new ComponentAccessViolationError(
            accessResult.reason || 'Read access denied',
            {
              systemId: this.name,
              operation: 'read',
              componentName: name,
              timestamp: Date.now()
            },
            accessResult.suggestedAction
          );
        }
      }

      componentTypes.push(componentType);
    }

    return world.query(...(componentTypes as any));
  }

  /**
   * Request access to a component from another system
   */
  protected requestComponentAccess(
    componentName: string,
    accessType: 'read' | 'write',
    ownerSystemId: string
  ): Promise<boolean> {
    // This is a placeholder for a more sophisticated access request system
    // In a real implementation, this might send a message to the owner system
    console.log(
      `System '${this.name}' requests ${accessType} access to component '${componentName}' from '${ownerSystemId}'`
    );
    
    // For now, return false (access must be granted manually)
    return Promise.resolve(false);
  }

  /**
   * Grant access to one of this system's components
   */
  protected grantComponentAccess(
    componentName: string,
    targetSystemId: string,
    accessType: 'read' | 'write'
  ): boolean {
    const ownedComponent = this.ownedComponents.get(componentName);
    if (!ownedComponent) {
      throw new Error(`System '${this.name}' does not own component '${componentName}'`);
    }

    if (accessType === 'read') {
      return enhancedComponentRegistry.grantReadAccess(ownedComponent.name, targetSystemId, this.name);
    } else {
      return enhancedComponentRegistry.grantWriteAccess(ownedComponent.name, targetSystemId, this.name);
    }
  }

  /**
   * Get system's owned components
   */
  protected getOwnedComponents(): ComponentRegistration[] {
    return enhancedComponentRegistry.getSystemComponents(this.name);
  }

  /**
   * Get system's unique ID
   */
  protected getSystemUniqueId(): string | undefined {
    return enhancedComponentRegistry.getSystemUniqueId(this.name);
  }

  /**
   * Initialize system - called once when system is added to world
   */
  init?(world: World): void {
    // Default implementation - systems can override
  }

  /**
   * Cleanup system - called when system is removed
   */
  cleanup?(world: World): void {
    // Default implementation - systems can override
  }
} 