/**
 * Component type registration with unique ID
 */
export interface ComponentType<T = any> {
  readonly id: number;
  readonly name: string;
  readonly constructor: new (...args: any[]) => T;
}

/**
 * Registry for managing component types
 * Provides deterministic component ID assignment
 */
export class ComponentRegistry {
  private components = new Map<string, ComponentType>();
  private componentsById = new Map<number, ComponentType>();
  private nextId = 0;
  private onIdRegistered?: (id: number) => void;
  
  /**
   * Set callback to be notified when component IDs are registered
   * Used for coordination with dynamic component registry
   */
  setIdRegistrationCallback(callback: (id: number) => void): void {
    this.onIdRegistered = callback;
  }
  
  /**
   * Register a new component type
   * @param name Unique name for the component type
   * @param constructor Component constructor function
   * @returns The registered component type
   */
  register<T>(name: string, constructor: new (...args: any[]) => T): ComponentType<T> {
    if (this.components.has(name)) {
      throw new Error(`Component type '${name}' is already registered`);
    }
    
    const componentType: ComponentType<T> = {
      id: this.nextId++,
      name,
      constructor
    };
    
    this.components.set(name, componentType);
    this.componentsById.set(componentType.id, componentType);
    
    // Notify dynamic registry of new static component ID
    if (this.onIdRegistered) {
      this.onIdRegistered(componentType.id);
    }
    
    return componentType;
  }
  
  /**
   * Get a component type by name
   * @param name The component type name
   * @returns The component type or undefined if not found
   */
  getType(name: string): ComponentType | undefined {
    return this.components.get(name);
  }
  
  /**
   * Get a component type by ID
   * @param id The component type ID
   * @returns The component type or undefined if not found
   */
  getTypeById(id: number): ComponentType | undefined {
    return this.componentsById.get(id);
  }
  
  /**
   * Get all registered component types
   * @returns Array of all component types
   */
  getAllTypes(): ComponentType[] {
    return Array.from(this.components.values());
  }
  
  /**
   * Get total number of registered component types
   * @returns The count of registered component types
   */
  getTypeCount(): number {
    return this.components.size;
  }
  
  /**
   * Clear all registered component types
   */
  clear(): void {
    this.components.clear();
    this.componentsById.clear();
    this.nextId = 0;
  }
}

/**
 * Global component registry instance
 */
export const componentRegistry = new ComponentRegistry(); 