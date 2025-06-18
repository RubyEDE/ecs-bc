import { World } from '../world';
import { Entity } from '../entity';
import { ComponentType, componentRegistry } from '../component';
import { Query } from '../query';
import { GasTracker } from './gas-tracker';
import { dynamicComponentRegistry } from './dynamic-component-registry';
import { entityAccessControl } from './entity-access-control';
import { systemMetricsCollector } from './system-metrics';
import { eventSystem } from './event-system';
import {
  SystemId,
  ComponentSchema,
  CreateEntityOptions,
  Permission,
  ResourceUsage,
  EntitySnapshot,
  ComponentSnapshot,
  ExecutionTrace,
  EventHandler,
  EmitOptions,
  SubscriptionId,
  QueryBuilderOptions,
  QueryBuilderFilter,
} from '../types';

/**
 * Enhanced query builder with access control
 */
export class EnhancedQueryBuilder {
  private world: World;
  private systemId: SystemId;
  private componentNames: string[] = [];
  private filters: QueryBuilderFilter[] = [];
  private options: QueryBuilderOptions = {};

  constructor(world: World, systemId: SystemId) {
    this.world = world;
    this.systemId = systemId;
  }

  /**
   * Add component requirement
   */
  withComponent(componentName: string): this {
    this.componentNames.push(componentName);
    return this;
  }

  /**
   * Add filter condition
   */
  where(component: string, field: string, operator: QueryBuilderFilter['operator'], value: any): this {
    this.filters.push({ component, field, operator, value });
    return this;
  }

  /**
   * Filter by entity owner
   */
  ownedBy(systemId: SystemId): this {
    this.options.ownedBy = systemId;
    return this;
  }

  /**
   * Filter by entities readable by system
   */
  readableBy(systemId: SystemId): this {
    this.options.readableBy = systemId;
    return this;
  }

  /**
   * Limit results
   */
  limit(count: number): this {
    this.options.limit = count;
    return this;
  }

  /**
   * Add offset
   */
  offset(count: number): this {
    this.options.offset = count;
    return this;
  }

  /**
   * Execute query with access control
   */
  execute(): Entity[] {
    // Get component types
    const componentTypes: ComponentType[] = [];
    for (const name of this.componentNames) {
      const componentType = dynamicComponentRegistry.getComponentType(name, this.systemId) ||
                           componentRegistry.getType(name);
      if (componentType) {
        componentTypes.push(componentType);
      }
    }

    // Execute basic query
    const query = this.world.query(...componentTypes);
    let entities = query.entities();

    // Apply access control filters
    if (this.options.ownedBy) {
      const ownedEntities = entityAccessControl.getOwnedEntities(this.options.ownedBy);
      entities = entities.filter(entity => ownedEntities.includes(entity.id));
    }

    if (this.options.readableBy) {
      const readableEntities = entityAccessControl.getReadableEntities(this.options.readableBy);
      entities = entities.filter(entity => readableEntities.includes(entity.id));
    }

    // Apply custom filters
    for (const filter of this.filters) {
      entities = this.applyFilter(entities, filter);
    }

    // Apply offset and limit
    if (this.options.offset) {
      entities = entities.slice(this.options.offset);
    }
    if (this.options.limit) {
      entities = entities.slice(0, this.options.limit);
    }

    return entities;
  }

  private applyFilter(entities: Entity[], filter: QueryBuilderFilter): Entity[] {
    const componentType = dynamicComponentRegistry.getComponentType(filter.component, this.systemId) ||
                         componentRegistry.getType(filter.component);
    
    if (!componentType) return entities;

    return entities.filter(entity => {
      const component = this.world.getComponent(entity, componentType);
      if (!component) return false;

      const fieldValue = filter.field ? (component as any)[filter.field] : component;

      switch (filter.operator) {
        case '=': return fieldValue === filter.value;
        case '!=': return fieldValue !== filter.value;
        case '>': return fieldValue > filter.value;
        case '<': return fieldValue < filter.value;
        case '>=': return fieldValue >= filter.value;
        case '<=': return fieldValue <= filter.value;
        case 'contains': return Array.isArray(fieldValue) && fieldValue.includes(filter.value);
        case 'exists': return fieldValue !== undefined && fieldValue !== null;
        default: return true;
      }
    });
  }
}

/**
 * Debug context for development tools
 */
export interface DebugContext {
  profile<T>(label: string, fn: () => T): T;
  log(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, data?: any): void;
  inspectEntity(entityId: number): EntitySnapshot | undefined;
  inspectComponent(componentName: string): ComponentSnapshot | undefined;
  trace(enabled: boolean): void;
  getExecutionTrace(): ExecutionTrace[];
}

/**
 * Enhanced System Context with full ECS + VM capabilities
 */
export class EnhancedSystemContext {
  private readonly world: World;
  private readonly gasTracker: GasTracker;
  private readonly systemId: SystemId;
  private readonly allowedComponents: Set<number>;
  private readonly debugMode: boolean;
  private tracingEnabled = false;

  constructor(
    world: World,
    gasTracker: GasTracker,
    systemId: SystemId,
    allowedComponents: ComponentType[],
    debugMode = false
  ) {
    this.world = world;
    this.gasTracker = gasTracker;
    this.systemId = systemId;
    this.allowedComponents = new Set(allowedComponents.map(c => c.id));
    this.debugMode = debugMode;
  }

  // ===== IDENTITY =====

  /**
   * Get current system ID
   */
  getMySystemId(): SystemId {
    return this.systemId;
  }

  /**
   * Get system permissions
   */
  getMyPermissions(): Permission[] {
    // TODO: Implement when system manager is created
    return [Permission.READ, Permission.WRITE, Permission.DELETE];
  }

  // ===== ENTITY MANAGEMENT =====

  /**
   * Create entity with ownership
   */
  createEntity(options: CreateEntityOptions = {}): Entity {
    this.gasTracker.consumeGas('entityCreate');
    
    const entity = this.world.createEntity();
    entityAccessControl.registerEntity(entity, this.systemId, options);
    
    systemMetricsCollector.recordEntityCreation(this.systemId, entity.id, this.gasTracker.getGasUsed());
    
    return entity;
  }

  /**
   * Delete entity with access control
   */
  deleteEntity(entity: Entity): void {
    this.gasTracker.consumeGas('entityDestroy');
    
    // Check delete permission
    entityAccessControl.validateAccess(entity, this.systemId, Permission.DELETE);
    
    entityAccessControl.unregisterEntity(entity);
    this.world.destroyEntity(entity);
  }

  // ===== COMPONENT MANAGEMENT =====

  /**
   * Define new component type with schema
   */
  defineComponent(name: string, schema: ComponentSchema): ComponentType {
    this.gasTracker.consumeGas('defineComponent');
    
    const componentType = dynamicComponentRegistry.defineComponent(name, schema, this.systemId);
    
    systemMetricsCollector.recordComponentCreation(this.systemId, componentType.id, this.gasTracker.getGasUsed());
    
    return componentType;
  }

  /**
   * Get component ID by name in system namespace
   */
  getComponentId(name: string): number | undefined {
    return dynamicComponentRegistry.getComponentId(name, this.systemId);
  }

  /**
   * Add component with validation and access control
   */
  addComponent(entity: Entity, componentName: string, data: any): void {
    this.gasTracker.consumeGas('addComponent');
    
    // Check write permission
    entityAccessControl.validateAccess(entity, this.systemId, Permission.WRITE);
    
    // Get component type
    const componentType = dynamicComponentRegistry.getComponentType(componentName, this.systemId);
    if (!componentType) {
      throw new Error(`Component '${componentName}' not found for system '${this.systemId}'`);
    }
    
    // Validate data against schema
    dynamicComponentRegistry.validateComponentData(data, componentName, this.systemId);
    
    this.world.addComponent(entity, componentType, data);
  }

  /**
   * Update component with validation and access control
   */
  updateComponent(entity: Entity, componentName: string, data: any): void {
    this.gasTracker.consumeGas('updateComponent');
    
    entityAccessControl.validateAccess(entity, this.systemId, Permission.WRITE);
    
    const componentType = dynamicComponentRegistry.getComponentType(componentName, this.systemId);
    if (!componentType) {
      throw new Error(`Component '${componentName}' not found for system '${this.systemId}'`);
    }
    
    dynamicComponentRegistry.validateComponentData(data, componentName, this.systemId);
    
    this.world.addComponent(entity, componentType, data);
  }

  /**
   * Remove component with access control
   */
  removeComponent(entity: Entity, componentName: string): void {
    this.gasTracker.consumeGas('removeComponent');
    
    entityAccessControl.validateAccess(entity, this.systemId, Permission.WRITE);
    
    const componentType = dynamicComponentRegistry.getComponentType(componentName, this.systemId);
    if (componentType) {
      this.world.removeComponent(entity, componentType);
    }
  }

  /**
   * Get component with access control
   */
  getComponent(entity: Entity, componentName: string): any {
    this.gasTracker.consumeGas('componentAccess');
    
    entityAccessControl.validateAccess(entity, this.systemId, Permission.READ);
    
    const componentType = dynamicComponentRegistry.getComponentType(componentName, this.systemId);
    if (!componentType) {
      return undefined;
    }
    
    return this.world.getComponent(entity, componentType);
  }

  // ===== ACCESS CONTROL =====

  /**
   * Grant access to entity
   */
  grantAccess(entity: Entity, targetSystemId: SystemId, permissions: Permission[]): void {
    entityAccessControl.grantAccess(entity, this.systemId, targetSystemId, permissions);
  }

  /**
   * Request access to entity
   */
  requestAccess(entity: Entity, permissions: Permission[]): boolean {
    return permissions.every(permission => 
      entityAccessControl.hasPermission(entity, this.systemId, permission)
    );
  }

  /**
   * Transfer entity ownership
   */
  transferOwnership(entity: Entity, newOwner: SystemId): void {
    entityAccessControl.transferOwnership(entity, this.systemId, newOwner);
  }

  // ===== QUERYING =====

  /**
   * Enhanced query builder with access control
   */
  query(componentNames: string[]): EnhancedQueryBuilder {
    this.gasTracker.consumeGas('entityQuery');
    
    const builder = new EnhancedQueryBuilder(this.world, this.systemId);
    for (const name of componentNames) {
      builder.withComponent(name);
    }
    
    return builder;
  }

  // ===== RESOURCE MANAGEMENT =====

  /**
   * Get remaining gas
   */
  getRemainingGas(): number {
    return this.gasTracker.getRemainingGas();
  }

  /**
   * Get current resource usage
   */
  getResourceUsage(): ResourceUsage {
    return systemMetricsCollector.getResourceUsage(this.systemId);
  }

  // ===== EVENT SYSTEM =====

  /**
   * Subscribe to events
   */
  subscribe(eventType: string, handler: EventHandler): SubscriptionId {
    this.gasTracker.consumeGas('eventSubscribe');
    return eventSystem.subscribe(this.systemId, eventType, handler);
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: SubscriptionId): void {
    eventSystem.unsubscribe(subscriptionId);
  }

  /**
   * Emit event
   */
  emit(eventType: string, data: any, options: EmitOptions = {}): void {
    this.gasTracker.consumeGas('eventEmit');
    eventSystem.emit(this.systemId, eventType, data, options);
  }

  // ===== LOGGING =====

  /**
   * Log message with system identification
   */
  log(...args: any[]): void {
    console.log(`[${this.systemId}]`, ...args);
  }

  warn(...args: any[]): void {
    console.warn(`[${this.systemId}]`, ...args);
  }

  error(...args: any[]): void {
    console.error(`[${this.systemId}]`, ...args);
  }

  // ===== DEBUG CONTEXT =====

  /**
   * Get debug context (only available in debug mode)
   */
  getDebugContext(): DebugContext | undefined {
    if (!this.debugMode) return undefined;

    return {
      profile: <T>(label: string, fn: () => T): T => {
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;
        console.log(`[${this.systemId}] Profile '${label}': ${duration.toFixed(2)}ms`);
        return result;
      },

      log: (message: string, data?: any) => {
        console.log(`[${this.systemId}] DEBUG:`, message, data);
      },

      warn: (message: string, data?: any) => {
        console.warn(`[${this.systemId}] DEBUG:`, message, data);
      },

      error: (message: string, data?: any) => {
        console.error(`[${this.systemId}] DEBUG:`, message, data);
      },

      inspectEntity: (entityId: number): EntitySnapshot | undefined => {
        const entity = { id: entityId, generation: 0 }; // Simplified
        const ownership = entityAccessControl.getOwnership(entity);
        if (!ownership) return undefined;

        return {
          entity,
          components: [], // Would need to iterate through all components
          ownership,
          metadata: {},
        };
      },

      inspectComponent: (componentName: string): ComponentSnapshot | undefined => {
        const registration = dynamicComponentRegistry.getComponentRegistration(componentName, this.systemId);
        if (!registration) return undefined;

        return {
          id: registration.id,
          name: registration.originalName,
          schema: registration.schema,
          systemId: registration.systemId,
          entityCount: 0, // Would need to count entities with this component
          totalMemoryUsage: 0,
        };
      },

      trace: (enabled: boolean) => {
        this.tracingEnabled = enabled;
        systemMetricsCollector.setTracingEnabled(enabled);
      },

      getExecutionTrace: (): ExecutionTrace[] => {
        return systemMetricsCollector.getExecutionTraces(this.systemId);
      },
    };
  }
} 