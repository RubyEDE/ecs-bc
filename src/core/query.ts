import { Entity } from './entity';
import { ComponentType } from './component';
import { ComponentMask } from './component-mask';
import { Archetype } from './archetype';

/**
 * Component tuple type helper for query results
 */
export type ComponentTuple<T extends readonly ComponentType[]> = {
  [K in keyof T]: T[K] extends ComponentType<infer U> ? U : never;
};

/**
 * Query result iterator that yields entities with their components
 */
export interface QueryIterator<T extends readonly ComponentType[]> {
  /**
   * Iterate over all matching entities with their components
   */
  iter(): Generator<[Entity, ...ComponentTuple<T>], void, unknown>;
  
  /**
   * Get array of all matching entities
   */
  entities(): Entity[];
  
  /**
   * Get count of matching entities
   */
  count(): number;
  
  /**
   * Check if query has any matches
   */
  isEmpty(): boolean;
}

/**
 * Query implementation for component access
 */
export class Query<T extends readonly ComponentType[]> implements QueryIterator<T> {
  private componentTypes: T;
  protected componentMask: ComponentMask;
  protected matchingArchetypes: Archetype[] = [];
  
  constructor(componentTypes: T) {
    this.componentTypes = componentTypes;
    this.componentMask = ComponentMask.fromComponentIds(componentTypes.map(t => t.id));
  }
  
  /**
   * Update the list of matching archetypes
   * @param archetypes All available archetypes
   */
  updateArchetypes(archetypes: Archetype[]): void {
    this.matchingArchetypes = archetypes.filter(archetype => 
      archetype.containsMask(this.componentMask)
    );
  }
  
  /**
   * Iterate over all entities that match this query
   */
  *iter(): Generator<[Entity, ...ComponentTuple<T>], void, unknown> {
    for (const archetype of this.matchingArchetypes) {
      // Get component arrays for the requested types
      const componentArrays = this.componentTypes.map(componentType => 
        archetype.getComponentArray(componentType)
      );
      
      // Skip archetype if any required component array is missing
      if (componentArrays.some(array => !array)) {
        continue;
      }
      
      // Iterate over archetype entities
      for (const [entity, ...archetypeComponents] of archetype.iterate()) {
        const queryComponents: any[] = [];
        
        // Extract only the components requested by this query
        for (let i = 0; i < this.componentTypes.length; i++) {
          const componentType = this.componentTypes[i];
          const componentArray = componentArrays[i]!;
          const entityIndex = archetype.hasEntity(entity) ? 
            archetype.getEntities().indexOf(entity) : -1;
          
          if (entityIndex >= 0) {
            queryComponents.push(componentArray.get(entityIndex));
          }
        }
        
        if (queryComponents.length === this.componentTypes.length) {
          yield [entity, ...queryComponents] as unknown as [Entity, ...ComponentTuple<T>];
        }
      }
    }
  }
  
  /**
   * Get array of all matching entities
   */
  entities(): Entity[] {
    const entities: Entity[] = [];
    for (const [entity] of this.iter()) {
      entities.push(entity);
    }
    return entities.sort((a, b) => a.id - b.id); // Deterministic order
  }
  
  /**
   * Get count of matching entities
   */
  count(): number {
    let count = 0;
    for (const archetype of this.matchingArchetypes) {
      if (archetype.containsMask(this.componentMask)) {
        count += archetype.getEntityCount();
      }
    }
    return count;
  }
  
  /**
   * Check if query has any matches
   */
  isEmpty(): boolean {
    return this.count() === 0;
  }
  
  /**
   * Get the component mask for this query
   */
  getComponentMask(): ComponentMask {
    return this.componentMask.clone();
  }
  
  /**
   * Get the component types for this query
   */
  getComponentTypes(): T {
    return this.componentTypes;
  }
}

/**
 * Exact query that matches entities with exactly the specified components
 */
export class ExactQuery<T extends readonly ComponentType[]> extends Query<T> {
  updateArchetypes(archetypes: Archetype[]): void {
    this.matchingArchetypes = archetypes.filter(archetype => 
      archetype.matchesMask(this.componentMask)
    );
  }
}

/**
 * With query that matches entities that have at least the specified components
 */
export class WithQuery<T extends readonly ComponentType[]> extends Query<T> {
  // Uses default implementation from Query class
}

/**
 * Without query that matches entities that don't have any of the specified components
 */
export class WithoutQuery<T extends readonly ComponentType[]> implements QueryIterator<[]> {
  private componentTypes: T;
  private componentMask: ComponentMask;
  private matchingArchetypes: Archetype[] = [];
  
  constructor(componentTypes: T) {
    this.componentTypes = componentTypes;
    this.componentMask = ComponentMask.fromComponentIds(componentTypes.map(t => t.id));
  }
  
  updateArchetypes(archetypes: Archetype[]): void {
    this.matchingArchetypes = archetypes.filter(archetype => {
      // Check if archetype has none of the excluded components
      for (const componentType of this.componentTypes) {
        if (archetype.componentMask.has(componentType.id)) {
          return false;
        }
      }
      return true;
    });
  }
  
  *iter(): Generator<[Entity], void, unknown> {
    for (const archetype of this.matchingArchetypes) {
      for (const [entity] of archetype.iterate()) {
        yield [entity];
      }
    }
  }
  
  entities(): Entity[] {
    const entities: Entity[] = [];
    for (const [entity] of this.iter()) {
      entities.push(entity);
    }
    return entities.sort((a, b) => a.id - b.id);
  }
  
  count(): number {
    let count = 0;
    for (const archetype of this.matchingArchetypes) {
      count += archetype.getEntityCount();
    }
    return count;
  }
  
  isEmpty(): boolean {
    return this.count() === 0;
  }
}

/**
 * Query builder for more complex query composition
 */
export class QueryBuilder {
  private withComponents: ComponentType[] = [];
  private withoutComponents: ComponentType[] = [];
  private exactComponents: ComponentType[] = [];
  
  /**
   * Add components that must be present
   */
  with<T extends readonly ComponentType[]>(...componentTypes: T): this {
    this.withComponents.push(...componentTypes);
    return this;
  }
  
  /**
   * Add components that must not be present
   */
  without<T extends readonly ComponentType[]>(...componentTypes: T): this {
    this.withoutComponents.push(...componentTypes);
    return this;
  }
  
  /**
   * Set exact components (entity must have exactly these components)
   */
  exact<T extends readonly ComponentType[]>(...componentTypes: T): this {
    this.exactComponents.push(...componentTypes);
    return this;
  }
  
  /**
   * Build the final query
   */
  build(): ComplexQuery {
    return new ComplexQuery(
      this.withComponents,
      this.withoutComponents,
      this.exactComponents
    );
  }
}

/**
 * Complex query that combines multiple query types
 */
export class ComplexQuery implements QueryIterator<any[]> {
  private withMask: ComponentMask;
  private withoutMask: ComponentMask;
  private exactMask: ComponentMask;
  private matchingArchetypes: Archetype[] = [];
  
  constructor(
    private withComponents: ComponentType[],
    private withoutComponents: ComponentType[],
    private exactComponents: ComponentType[]
  ) {
    this.withMask = ComponentMask.fromComponentIds(withComponents.map(t => t.id));
    this.withoutMask = ComponentMask.fromComponentIds(withoutComponents.map(t => t.id));
    this.exactMask = ComponentMask.fromComponentIds(exactComponents.map(t => t.id));
  }
  
  updateArchetypes(archetypes: Archetype[]): void {
    this.matchingArchetypes = archetypes.filter(archetype => {
      // Check exact match if specified
      if (this.exactComponents.length > 0) {
        if (!archetype.matchesMask(this.exactMask)) {
          return false;
        }
      }
      
      // Check required components
      if (this.withComponents.length > 0) {
        if (!archetype.containsMask(this.withMask)) {
          return false;
        }
      }
      
      // Check excluded components
      if (this.withoutComponents.length > 0) {
        for (const componentType of this.withoutComponents) {
          if (archetype.componentMask.has(componentType.id)) {
            return false;
          }
        }
      }
      
      return true;
    });
  }
  
  *iter(): Generator<[Entity, ...any[]], void, unknown> {
    for (const archetype of this.matchingArchetypes) {
      for (const result of archetype.iterate()) {
        yield result;
      }
    }
  }
  
  entities(): Entity[] {
    const entities: Entity[] = [];
    for (const [entity] of this.iter()) {
      entities.push(entity);
    }
    return entities.sort((a, b) => a.id - b.id);
  }
  
  count(): number {
    let count = 0;
    for (const archetype of this.matchingArchetypes) {
      count += archetype.getEntityCount();
    }
    return count;
  }
  
  isEmpty(): boolean {
    return this.count() === 0;
  }
} 