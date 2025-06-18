import { Entity } from './entity';
import { ComponentType } from './component';
import { ComponentMask } from './component-mask';
import { ComponentArray, ComponentArrayFactory, ComponentArrayPool } from './component-storage';

/**
 * Archetype manages entities with the same component composition
 * Uses Structure of Arrays (SoA) for optimal cache performance
 */
export class Archetype {
  readonly componentMask: ComponentMask;
  readonly componentTypes: ComponentType[];
  private entities: Entity[] = [];
  private components: Map<number, ComponentArray<any>> = new Map();
  private entityToIndex: Map<number, number> = new Map();
  private componentArrayPool: ComponentArrayPool;
  
  constructor(
    componentTypes: ComponentType[],
    componentArrayPool: ComponentArrayPool
  ) {
    this.componentTypes = [...componentTypes].sort((a, b) => a.id - b.id); // Deterministic order
    this.componentMask = ComponentMask.fromComponentIds(this.componentTypes.map(t => t.id));
    this.componentArrayPool = componentArrayPool;
    
    // Initialize component arrays
    for (const componentType of this.componentTypes) {
      const array = this.componentArrayPool.acquire(componentType.name, componentType.constructor);
      this.components.set(componentType.id, array);
    }
  }
  
  /**
   * Add an entity to this archetype with its components
   * @param entity The entity to add
   * @param componentData Map of component type ID to component instance
   * @returns The index where the entity was added
   */
  addEntity(entity: Entity, componentData: Map<number, any>): number {
    // Check if entity already exists
    if (this.entityToIndex.has(entity.id)) {
      throw new Error(`Entity ${entity.id} already exists in archetype`);
    }
    
    // Validate all required components are present
    for (const componentType of this.componentTypes) {
      if (!componentData.has(componentType.id)) {
        throw new Error(`Missing component ${componentType.name} for entity ${entity.id}`);
      }
    }
    
    const index = this.entities.length;
    
    // Add entity
    this.entities.push(entity);
    this.entityToIndex.set(entity.id, index);
    
    // Add components
    for (const componentType of this.componentTypes) {
      const componentArray = this.components.get(componentType.id)!;
      const component = componentData.get(componentType.id);
      componentArray.push(component);
    }
    
    return index;
  }
  
  /**
   * Remove an entity from this archetype
   * @param entity The entity to remove
   * @returns The removed component data
   */
  removeEntity(entity: Entity): Map<number, any> | undefined {
    const index = this.entityToIndex.get(entity.id);
    if (index === undefined) {
      return undefined;
    }
    
    const componentData = new Map<number, any>();
    
    // Collect component data before removal
    for (const componentType of this.componentTypes) {
      const componentArray = this.components.get(componentType.id)!;
      componentData.set(componentType.id, componentArray.get(index));
    }
    
    // Remove from arrays using swap-remove for O(1) removal
    const lastIndex = this.entities.length - 1;
    
    if (index !== lastIndex) {
      // Swap with last entity
      const lastEntity = this.entities[lastIndex];
      this.entities[index] = lastEntity;
      this.entityToIndex.set(lastEntity.id, index);
      
      // Swap components
      for (const componentType of this.componentTypes) {
        const componentArray = this.components.get(componentType.id)!;
        const lastComponent = componentArray.get(lastIndex);
        componentArray.set(index, lastComponent);
      }
    }
    
    // Remove last elements
    this.entities.pop();
    this.entityToIndex.delete(entity.id);
    
    for (const componentType of this.componentTypes) {
      const componentArray = this.components.get(componentType.id)!;
      componentArray.pop();
    }
    
    return componentData;
  }
  
  /**
   * Get component for an entity
   * @param entity The entity
   * @param componentType The component type
   * @returns The component instance or undefined
   */
  getComponent<T>(entity: Entity, componentType: ComponentType<T>): T | undefined {
    const index = this.entityToIndex.get(entity.id);
    if (index === undefined) {
      return undefined;
    }
    
    const componentArray = this.components.get(componentType.id);
    if (!componentArray) {
      return undefined;
    }
    
    return componentArray.get(index);
  }
  
  /**
   * Set component for an entity
   * @param entity The entity
   * @param componentType The component type
   * @param component The component instance
   */
  setComponent<T>(entity: Entity, componentType: ComponentType<T>, component: T): void {
    const index = this.entityToIndex.get(entity.id);
    if (index === undefined) {
      throw new Error(`Entity ${entity.id} not found in archetype`);
    }
    
    const componentArray = this.components.get(componentType.id);
    if (!componentArray) {
      throw new Error(`Component type ${componentType.name} not in archetype`);
    }
    
    componentArray.set(index, component);
  }
  
  /**
   * Check if this archetype contains an entity
   * @param entity The entity to check
   * @returns True if entity is in this archetype
   */
  hasEntity(entity: Entity): boolean {
    return this.entityToIndex.has(entity.id);
  }
  
  /**
   * Get all entities in this archetype
   * @returns Array of entities (sorted by ID for determinism)
   */
  getEntities(): Entity[] {
    return [...this.entities].sort((a, b) => a.id - b.id);
  }
  
  /**
   * Get component array for a specific component type
   * @param componentType The component type
   * @returns The component array or undefined
   */
  getComponentArray<T>(componentType: ComponentType<T>): ComponentArray<T> | undefined {
    return this.components.get(componentType.id) as ComponentArray<T> | undefined;
  }
  
  /**
   * Get all component arrays
   * @returns Map of component type ID to component array
   */
  getComponentArrays(): Map<number, ComponentArray<any>> {
    return new Map(this.components);
  }
  
  /**
   * Get number of entities in this archetype
   * @returns Entity count
   */
  getEntityCount(): number {
    return this.entities.length;
  }
  
  /**
   * Check if archetype is empty
   * @returns True if no entities
   */
  isEmpty(): boolean {
    return this.entities.length === 0;
  }
  
  /**
   * Iterate over entities with their components
   * @returns Generator yielding [entity, ...components]
   */
  *iterate(): Generator<[Entity, ...any[]], void, unknown> {
    // Sort entities by ID for deterministic iteration
    const sortedIndices = Array.from({ length: this.entities.length }, (_, i) => i)
      .sort((a, b) => this.entities[a].id - this.entities[b].id);
    
    for (const index of sortedIndices) {
      const entity = this.entities[index];
      const components: any[] = [];
      
      for (const componentType of this.componentTypes) {
        const componentArray = this.components.get(componentType.id)!;
        components.push(componentArray.get(index));
      }
      
      yield [entity, ...components] as [Entity, ...any[]];
    }
  }
  
  /**
   * Clear all entities and return component arrays to pool
   */
  clear(): void {
    this.entities.length = 0;
    this.entityToIndex.clear();
    
    // Return component arrays to pool
    for (const componentType of this.componentTypes) {
      const componentArray = this.components.get(componentType.id)!;
      this.componentArrayPool.release(componentType.name, componentArray);
    }
    
    this.components.clear();
  }
  
  /**
   * Generate a hash key for this archetype based on component mask
   * @returns Hash key string
   */
  getHashKey(): string {
    return this.componentMask.getMask().toString();
  }
  
  /**
   * Check if this archetype matches a component mask
   * @param mask The component mask to check
   * @returns True if masks match exactly
   */
  matchesMask(mask: ComponentMask): boolean {
    return this.componentMask.equals(mask);
  }
  
  /**
   * Check if this archetype contains all components in a mask
   * @param mask The component mask to check
   * @returns True if this archetype contains all components
   */
  containsMask(mask: ComponentMask): boolean {
    return this.componentMask.contains(mask);
  }
} 