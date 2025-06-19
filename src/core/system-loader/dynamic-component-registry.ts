import * as crypto from 'crypto';
import { ComponentType, componentRegistry } from '../component';
import { ComponentSchema, ComponentRegistration, SystemId, ComponentId } from '../types';
import { ComponentSchemaValidator } from './component-schema-validator';

/**
 * Dynamic component registry for runtime component creation with namespacing
 * Supports unlimited component types for prototyping
 */
export class DynamicComponentRegistry {
  private componentRegistrations = new Map<string, ComponentRegistration>();
  private systemComponents = new Map<SystemId, Set<ComponentId>>();
  private hashedIdToRegistration = new Map<string, ComponentRegistration>();
  private schemaValidator = new ComponentSchemaValidator();
  
  // ID management for unlimited components during prototyping
  private usedIds = new Set<ComponentId>();
  private nextDynamicId = 1000; // Start dynamic components at 1000 to avoid conflicts with static components
  
  constructor() {
    // Initialize with current static component IDs
    this.refreshStaticComponentIds();
    
    // Set up callback to track new static component registrations
    componentRegistry.setIdRegistrationCallback((id: ComponentId) => {
      this.reserveComponentId(id);
    });
  }

  /**
   * Refresh the list of used static component IDs
   * Should be called when static components are registered
   */
  refreshStaticComponentIds(): void {
    const staticComponents = componentRegistry.getAllTypes();
    
    // Clear only static component IDs (< 1000)
    const dynamicIds = Array.from(this.usedIds).filter(id => id >= 1000);
    this.usedIds.clear();
    
    // Re-add dynamic IDs
    for (const id of dynamicIds) {
      this.usedIds.add(id);
    }
    
    // Add static component IDs
    for (const component of staticComponents) {
      if (component.id >= 0) {
        this.usedIds.add(component.id);
      }
    }
  }

  /**
   * Reserve a component ID to prevent dynamic allocation conflicts
   * @param componentId The ID to reserve
   */
  reserveComponentId(componentId: ComponentId): void {
    if (componentId < 0) {
      throw new Error(`Component ID ${componentId} must be non-negative`);
    }
    this.usedIds.add(componentId);
  }

  /**
   * Find the next available component ID
   * @returns Available component ID
   */
  private allocateComponentId(): ComponentId {
    // Find next available ID starting from nextDynamicId
    while (this.usedIds.has(this.nextDynamicId)) {
      this.nextDynamicId++;
    }
    
    const allocatedId = this.nextDynamicId;
    this.usedIds.add(allocatedId);
    this.nextDynamicId++;
    
    return allocatedId;
  }

  /**
   * Configure the dynamic component ID starting point
   * @param startId Starting ID for dynamic components (default: 1000)
   */
  configureDynamicIdStart(startId: number): void {
    if (startId < 0) {
      throw new Error(`Dynamic ID start ${startId} must be non-negative`);
    }
    
    // Only allow increasing the start ID to avoid conflicts
    if (startId > this.nextDynamicId) {
      this.nextDynamicId = startId;
    }
  }

  /**
   * Define a new component type at runtime with system-based namespacing
   */
  defineComponent(
    name: string,
    schema: ComponentSchema,
    systemId: SystemId
  ): ComponentType {
    // Validate schema first
    this.schemaValidator.validateSchema(schema);

    // Create namespaced component ID using hash
    const hashedId = this.createHashedId(systemId, name);
    
    // Check if component already exists for this system
    if (this.hashedIdToRegistration.has(hashedId)) {
      const existing = this.hashedIdToRegistration.get(hashedId)!;
      
      // Allow version updates for the same system
      if (existing.systemId === systemId) {
        if (schema.version <= existing.schema.version) {
          throw new Error(`Component '${name}' version ${schema.version} must be greater than existing version ${existing.schema.version}`);
        }
        
        // Update schema version
        existing.schema = schema;
        return this.getComponentTypeById(existing.id)!;
      } else {
        throw new Error(`Component name '${name}' conflicts with existing component from system '${existing.systemId}'`);
      }
    }

    // Refresh static component IDs before allocation
    this.refreshStaticComponentIds();

    // Allocate new component ID
    const componentId = this.allocateComponentId();

    // Create component constructor
    const componentConstructor = class DynamicComponent {
      constructor(data: any = {}) {
        // Validate data against schema during construction
        this.validateAndAssign(data, schema);
      }

      private validateAndAssign(data: any, schema: ComponentSchema): void {
        const validator = new ComponentSchemaValidator();
        validator.validateData(data, schema);
        
        // Assign validated data to instance
        Object.assign(this, data);
      }
    };

    // Register with the global component registry
    const componentType = componentRegistry.register(hashedId, componentConstructor as any);

    // Create registration record
    const registration: ComponentRegistration = {
      id: componentId,
      hashedId,
      originalName: name,
      systemId,
      schema,
      createdAt: Date.now(),
    };

    // Store registration
    this.componentRegistrations.set(name + ':' + systemId, registration);
    this.hashedIdToRegistration.set(hashedId, registration);

    // Track components per system
    if (!this.systemComponents.has(systemId)) {
      this.systemComponents.set(systemId, new Set());
    }
    this.systemComponents.get(systemId)!.add(componentId);

    // Override the component type ID to use our dynamic ID
    (componentType as any).id = componentId;

    return componentType as ComponentType;
  }

  /**
   * Get component ID by name within a system's namespace
   */
  getComponentId(name: string, systemId: SystemId): ComponentId | undefined {
    const registration = this.componentRegistrations.get(name + ':' + systemId);
    return registration?.id;
  }

  /**
   * Get component type by name within a system's namespace
   */
  getComponentType(name: string, systemId: SystemId): ComponentType | undefined {
    const hashedId = this.createHashedId(systemId, name);
    return componentRegistry.getType(hashedId);
  }

  /**
   * Get component type by ID
   */
  getComponentTypeById(componentId: ComponentId): ComponentType | undefined {
    // Check dynamic components first
    for (const registration of this.hashedIdToRegistration.values()) {
      if (registration.id === componentId) {
        return componentRegistry.getType(registration.hashedId);
      }
    }
    
    // Fall back to static components
    return componentRegistry.getTypeById(componentId);
  }

  /**
   * Get component registration information
   */
  getComponentRegistration(name: string, systemId: SystemId): ComponentRegistration | undefined {
    return this.componentRegistrations.get(name + ':' + systemId);
  }

  /**
   * Get all components created by a system
   */
  getSystemComponents(systemId: SystemId): ComponentRegistration[] {
    const componentIds = this.systemComponents.get(systemId);
    if (!componentIds) return [];

    const registrations: ComponentRegistration[] = [];
    for (const registration of this.hashedIdToRegistration.values()) {
      if (componentIds.has(registration.id)) {
        registrations.push(registration);
      }
    }
    return registrations;
  }

  /**
   * Validate component data against its schema
   */
  validateComponentData(data: any, name: string, systemId: SystemId): void {
    const registration = this.componentRegistrations.get(name + ':' + systemId);
    if (!registration) {
      throw new Error(`Component '${name}' not found for system '${systemId}'`);
    }

    this.schemaValidator.validateData(data, registration.schema);
  }

  /**
   * Check if a component exists in a system's namespace
   */
  hasComponent(name: string, systemId: SystemId): boolean {
    return this.componentRegistrations.has(name + ':' + systemId);
  }

  /**
   * Remove all components created by a system
   */
  removeSystemComponents(systemId: SystemId): void {
    const componentIds = this.systemComponents.get(systemId);
    if (!componentIds) return;

    // Remove registrations and free IDs
    for (const registration of Array.from(this.hashedIdToRegistration.values())) {
      if (componentIds.has(registration.id)) {
        this.componentRegistrations.delete(registration.originalName + ':' + systemId);
        this.hashedIdToRegistration.delete(registration.hashedId);
        this.usedIds.delete(registration.id); // Free the ID for reuse
      }
    }

    // Clear system tracking
    this.systemComponents.delete(systemId);
  }

  /**
   * Get statistics about dynamic components
   */
  getStats(): {
    totalComponents: number;
    systemsWithComponents: number;
    averageComponentsPerSystem: number;
    totalMemoryUsage: number;
    usedIdSlots: number;
    nextAvailableId: number;
    idAllocationStrategy: {
      dynamicIdStart: number;
      nextDynamicId: number;
      staticComponentCount: number;
    };
  } {
    const totalComponents = this.hashedIdToRegistration.size;
    const systemsWithComponents = this.systemComponents.size;
    const averageComponentsPerSystem = systemsWithComponents > 0 
      ? totalComponents / systemsWithComponents 
      : 0;

    // Rough memory usage calculation
    const totalMemoryUsage = Array.from(this.hashedIdToRegistration.values())
      .reduce((total, reg) => {
        return total + JSON.stringify(reg).length;
      }, 0);

    const usedIdSlots = this.usedIds.size;
    const staticComponentCount = Array.from(this.usedIds).filter(id => id < 1000).length;

    return {
      totalComponents,
      systemsWithComponents,
      averageComponentsPerSystem,
      totalMemoryUsage,
      usedIdSlots,
      nextAvailableId: this.nextDynamicId,
      idAllocationStrategy: {
        dynamicIdStart: 1000,
        nextDynamicId: this.nextDynamicId,
        staticComponentCount,
      },
    };
  }

  /**
   * Create a hashed ID for component namespacing
   */
  private createHashedId(systemId: SystemId, componentName: string): string {
    const input = `${systemId}:${componentName}`;
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
  }

  /**
   * Clear all dynamic components
   */
  clear(): void {
    // Free all dynamic component IDs (>= 1000)
    for (const registration of this.hashedIdToRegistration.values()) {
      if (registration.id >= 1000) {
        this.usedIds.delete(registration.id);
      }
    }
    
    this.componentRegistrations.clear();
    this.systemComponents.clear();
    this.hashedIdToRegistration.clear();
    
    // Reset dynamic ID counter
    this.nextDynamicId = 1000;
    
    // Refresh static component IDs
    this.refreshStaticComponentIds();
  }
}

/**
 * Global dynamic component registry instance
 */
export const dynamicComponentRegistry = new DynamicComponentRegistry(); 