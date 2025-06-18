import { Entity, EntityAllocator } from './entity';
import { ComponentType, componentRegistry } from './component';
import { ComponentMask } from './component-mask';
import { ComponentArrayPool } from './component-storage';
import { Archetype } from './archetype';
import { Query, QueryIterator, ExactQuery, WithQuery, WithoutQuery, QueryBuilder } from './query';
import { System, SystemScheduler, SystemPriority } from './system';
import { SystemLoader, UserSystem, SystemLoaderConfig } from './system-loader';

/**
 * World is the central ECS manager that coordinates all entities, components, and systems
 */
export class World {
  private entityAllocator = new EntityAllocator();
  private componentArrayPool = new ComponentArrayPool();
  private systemScheduler = new SystemScheduler();
  private systemLoader: SystemLoader;
  
  // Archetype management
  private archetypes = new Map<string, Archetype>();
  private archetypeList: Archetype[] = [];
  private entityToArchetype = new Map<number, Archetype>();
  
  // Query caching
  private queryCache = new Map<string, any>();
  private queryCacheInvalidated = true;
  
  // Performance tracking
  private frameCount = 0;
  private lastFrameTime = 0;
  
  constructor(systemLoaderConfig?: SystemLoaderConfig) {
    this.systemLoader = new SystemLoader(systemLoaderConfig);
  }
  
  /**
   * Create a new entity
   * @returns The created entity
   */
  createEntity(): Entity {
    const entity = this.entityAllocator.allocate();
    this.invalidateQueryCache();
    return entity;
  }
  
  /**
   * Destroy an entity and remove all its components
   * @param entity The entity to destroy
   */
  destroyEntity(entity: Entity): void {
    if (!this.entityAllocator.isAlive(entity)) {
      throw new Error(`Entity ${entity.id}:${entity.generation} is already dead`);
    }
    
    // Remove from archetype
    const archetype = this.entityToArchetype.get(entity.id);
    if (archetype) {
      archetype.removeEntity(entity);
      this.entityToArchetype.delete(entity.id);
      
      // Clean up empty archetype
      if (archetype.isEmpty()) {
        this.removeEmptyArchetype(archetype);
      }
    }
    
    // Deallocate entity
    this.entityAllocator.deallocate(entity);
    this.invalidateQueryCache();
  }
  
  /**
   * Add a component to an entity
   * @param entity The entity
   * @param componentType The component type
   * @param component The component instance
   */
  addComponent<T>(entity: Entity, componentType: ComponentType<T>, component: T): void;
  addComponent<T>(entity: Entity, component: T): void;
  addComponent<T>(entity: Entity, componentTypeOrComponent: ComponentType<T> | T, component?: T): void {
    if (!this.entityAllocator.isAlive(entity)) {
      throw new Error(`Entity ${entity.id}:${entity.generation} is dead`);
    }
    
    let componentType: ComponentType<T>;
    let actualComponent: T;
    
    if (component !== undefined) {
      // Two-parameter version: componentType and component explicitly provided
      componentType = componentTypeOrComponent as ComponentType<T>;
      actualComponent = component;
    } else {
      // Single-parameter version: try to infer component type from instance
      actualComponent = componentTypeOrComponent as T;
      const inferredType = this.getComponentTypeFromInstance(actualComponent);
      if (!inferredType) {
        throw new Error(`Component type not registered for component: ${actualComponent}`);
      }
      componentType = inferredType;
    }
    
    const currentArchetype = this.entityToArchetype.get(entity.id);
    let newComponentTypes: ComponentType[];
    let existingComponents = new Map<number, any>();
    
    if (currentArchetype) {
      // Check if component already exists
      if (currentArchetype.componentMask.has(componentType.id)) {
        // Update existing component
        currentArchetype.setComponent(entity, componentType, actualComponent);
        return;
      }
      
      // Remove from current archetype and get existing component data
      const componentData = currentArchetype.removeEntity(entity);
      if (componentData) {
        existingComponents = componentData;
      }
      
      // Clean up empty archetype
      if (currentArchetype.isEmpty()) {
        this.removeEmptyArchetype(currentArchetype);
      }
      
      newComponentTypes = [...currentArchetype.componentTypes, componentType];
    } else {
      newComponentTypes = [componentType];
    }
    
    // Add new component
    existingComponents.set(componentType.id, actualComponent);
    
    // Find or create target archetype
    const targetArchetype = this.getOrCreateArchetype(newComponentTypes);
    
    // Add entity to new archetype
    targetArchetype.addEntity(entity, existingComponents);
    this.entityToArchetype.set(entity.id, targetArchetype);
    
    this.invalidateQueryCache();
  }
  
  /**
   * Remove a component from an entity
   * @param entity The entity
   * @param componentType The component type to remove
   */
  removeComponent<T>(entity: Entity, componentType: ComponentType<T>): void {
    if (!this.entityAllocator.isAlive(entity)) {
      throw new Error(`Entity ${entity.id}:${entity.generation} is dead`);
    }
    
    const currentArchetype = this.entityToArchetype.get(entity.id);
    if (!currentArchetype || !currentArchetype.componentMask.has(componentType.id)) {
      return; // Component doesn't exist
    }
    
    // Collect remaining components
    const remainingComponents = new Map<number, any>();
    const remainingTypes: ComponentType[] = [];
    
    for (const existingType of currentArchetype.componentTypes) {
      if (existingType.id !== componentType.id) {
        const existingComponent = currentArchetype.getComponent(entity, existingType);
        if (existingComponent !== undefined) {
          remainingComponents.set(existingType.id, existingComponent);
          remainingTypes.push(existingType);
        }
      }
    }
    
    // Remove from current archetype
    currentArchetype.removeEntity(entity);
    
    // Clean up empty archetype
    if (currentArchetype.isEmpty()) {
      this.removeEmptyArchetype(currentArchetype);
    }
    
    if (remainingTypes.length > 0) {
      // Move to new archetype with remaining components
      const targetArchetype = this.getOrCreateArchetype(remainingTypes);
      targetArchetype.addEntity(entity, remainingComponents);
      this.entityToArchetype.set(entity.id, targetArchetype);
    } else {
      // Entity has no components left
      this.entityToArchetype.delete(entity.id);
    }
    
    this.invalidateQueryCache();
  }
  
  /**
   * Get a component from an entity
   * @param entity The entity
   * @param componentType The component type
   * @returns The component instance or undefined
   */
  getComponent<T>(entity: Entity, componentType: ComponentType<T>): T | undefined {
    if (!this.entityAllocator.isAlive(entity)) {
      return undefined;
    }
    
    const archetype = this.entityToArchetype.get(entity.id);
    return archetype?.getComponent(entity, componentType);
  }
  
  /**
   * Check if an entity has a specific component
   * @param entity The entity
   * @param componentType The component type
   * @returns True if the entity has the component
   */
  hasComponent<T>(entity: Entity, componentType: ComponentType<T>): boolean {
    const archetype = this.entityToArchetype.get(entity.id);
    return archetype?.componentMask.has(componentType.id) ?? false;
  }
  
  /**
   * Create a query for entities with specific components
   * @param componentTypes The component types to query for
   * @returns A query object for iteration
   */
  query<T extends readonly ComponentType[]>(...componentTypes: T): Query<T> {
    const cacheKey = this.generateQueryCacheKey('with', componentTypes);
    
    if (!this.queryCacheInvalidated && this.queryCache.has(cacheKey)) {
      return this.queryCache.get(cacheKey) as Query<T>;
    }
    
    const query = new Query(componentTypes);
    query.updateArchetypes(this.archetypeList);
    
    this.queryCache.set(cacheKey, query);
    return query;
  }
  
  /**
   * Create an exact query for entities with exactly the specified components
   * @param componentTypes The component types
   * @returns An exact query object
   */
  queryExact<T extends readonly ComponentType[]>(...componentTypes: T): ExactQuery<T> {
    const cacheKey = this.generateQueryCacheKey('exact', componentTypes);
    
    if (!this.queryCacheInvalidated && this.queryCache.has(cacheKey)) {
      return this.queryCache.get(cacheKey) as ExactQuery<T>;
    }
    
    const query = new ExactQuery(componentTypes);
    query.updateArchetypes(this.archetypeList);
    
    this.queryCache.set(cacheKey, query);
    return query;
  }
  
  /**
   * Create a query builder for complex queries
   * @returns A query builder instance
   */
  queryBuilder(): QueryBuilder {
    return new QueryBuilder();
  }
  
  /**
   * Add a system to the world
   * @param system The system to add
   * @param priority Execution priority
   * @returns The assigned system ID
   */
  addSystem(system: System, priority: number = SystemPriority.NORMAL): number {
    return this.systemScheduler.addSystem(system, priority);
  }
  
  /**
   * Remove a system from the world
   * @param systemName The name of the system to remove
   */
  removeSystem(systemName: string): void {
    this.systemScheduler.removeSystem(systemName);
  }
  
  /**
   * Enable or disable a system
   * @param systemName The system name
   * @param enabled Whether the system should be enabled
   */
  setSystemEnabled(systemName: string, enabled: boolean): void {
    this.systemScheduler.setSystemEnabled(systemName, enabled);
  }
  
  /**
   * Run all systems for one frame
   * @param deltaTime Time elapsed since last frame
   */
  runSystems(deltaTime: number = 0.016): void {
    this.updateQueryCache();
    
    const frameStartTime = performance.now();
    this.systemScheduler.executeSystems(this, deltaTime);
    this.lastFrameTime = performance.now() - frameStartTime;
    
    this.frameCount++;
  }
  
  /**
   * Initialize all systems
   */
  initializeSystems(): void {
    this.systemScheduler.initializeSystems(this);
  }
  
  /**
   * Get all entities in the world
   * @returns Array of all alive entities
   */
  getAllEntities(): Entity[] {
    const entities: Entity[] = [];
    
    for (const archetype of this.archetypeList) {
      entities.push(...archetype.getEntities());
    }
    
    return entities.sort((a, b) => a.id - b.id);
  }
  
  /**
   * Get world statistics
   * @returns World statistics
   */
  getStats(): {
    entityCount: number;
    archetypeCount: number;
    systemCount: number;
    frameCount: number;
    lastFrameTime: number;
    aliveEntities: number;
    totalAllocatedEntities: number;
  } {
    return {
      entityCount: this.getAllEntities().length,
      archetypeCount: this.archetypeList.length,
      systemCount: this.systemScheduler.getAllSystems().length,
      frameCount: this.frameCount,
      lastFrameTime: this.lastFrameTime,
      aliveEntities: this.entityAllocator.getAliveCount(),
      totalAllocatedEntities: this.entityAllocator.getTotalAllocated()
    };
  }
  
  /**
   * Clear the world (remove all entities, systems, etc.)
   */
  clear(): void {
    // Clean up systems first
    this.systemScheduler.cleanupSystems(this);
    this.systemScheduler.clear();
    
    // Clear archetypes
    for (const archetype of this.archetypeList) {
      archetype.clear();
    }
    this.archetypes.clear();
    this.archetypeList = [];
    this.entityToArchetype.clear();
    
    // Clear entity allocator
    this.entityAllocator = new EntityAllocator();
    
    // Clear caches
    this.queryCache.clear();
    this.componentArrayPool.clearPools();
    
    // Reset counters
    this.frameCount = 0;
    this.lastFrameTime = 0;
  }
  
  /**
   * Get or create an archetype for the given component types
   */
  private getOrCreateArchetype(componentTypes: ComponentType[]): Archetype {
    const sortedTypes = [...componentTypes].sort((a, b) => a.id - b.id);
    const mask = ComponentMask.fromComponentIds(sortedTypes.map(t => t.id));
    const hashKey = mask.getMask().toString();
    
    let archetype = this.archetypes.get(hashKey);
    if (!archetype) {
      archetype = new Archetype(sortedTypes, this.componentArrayPool);
      this.archetypes.set(hashKey, archetype);
      this.archetypeList.push(archetype);
      this.invalidateQueryCache();
    }
    
    return archetype;
  }
  
  /**
   * Remove an empty archetype from storage
   */
  private removeEmptyArchetype(archetype: Archetype): void {
    const hashKey = archetype.getHashKey();
    
    if (this.archetypes.has(hashKey)) {
      this.archetypes.delete(hashKey);
      const index = this.archetypeList.indexOf(archetype);
      if (index >= 0) {
        this.archetypeList.splice(index, 1);
      }
      archetype.clear();
      this.invalidateQueryCache();
    }
  }
  
  /**
   * Get component type from component instance
   */
  private getComponentTypeFromInstance<T>(component: T): ComponentType<T> | undefined {
    if (!component || typeof component !== 'object') {
      return undefined;
    }
    
    const constructorName = (component as any).constructor.name;
    return componentRegistry.getType(constructorName) as ComponentType<T> | undefined;
  }
  
  /**
   * Invalidate query cache
   */
  private invalidateQueryCache(): void {
    this.queryCacheInvalidated = true;
  }
  
  /**
   * Update query cache with current archetypes
   */
  private updateQueryCache(): void {
    if (!this.queryCacheInvalidated) {
      return;
    }
    
    for (const query of this.queryCache.values()) {
      if (query instanceof Query) {
        query.updateArchetypes(this.archetypeList);
      }
    }
    
    this.queryCacheInvalidated = false;
  }
  
  /**
   * Generate cache key for queries
   */
  private generateQueryCacheKey(type: string, componentTypes: readonly ComponentType[]): string {
    const ids = componentTypes.map(t => t.id).sort().join(',');
    return `${type}:${ids}`;
  }
  
  /**
   * Load and register a user-defined system from TypeScript source code
   * @param source TypeScript source code
   * @param priority System execution priority
   * @returns The loaded system ID
   */
  loadSystemFromSource(source: string, priority: number = SystemPriority.USER): number {
    const system = this.systemLoader.loadFromSource(source);
    return this.addSystem(system, priority);
  }
  
  /**
   * Load a system from a TypeScript file using SystemLoader
   * @param filePath Path to TypeScript file
   * @returns Promise resolving to loaded system
   */
  async loadSystemFromFile(filePath: string): Promise<UserSystem> {
    return await this.systemLoader.loadFromFile(filePath);
  }
  
  /**
   * Get a loaded user system by name
   * @param name System name
   * @returns The user system or undefined
   */
  getLoadedSystem(name: string): UserSystem | undefined {
    return this.systemLoader.getLoadedSystem(name);
  }
  
  /**
   * Get all loaded user systems
   * @returns Array of loaded user systems
   */
  getAllLoadedSystems(): UserSystem[] {
    return this.systemLoader.getAllLoadedSystems();
  }
  
  /**
   * Unload a user system
   * @param name System name
   */
  unloadSystem(name: string): void {
    this.systemLoader.unloadSystem(name);
    this.removeSystem(name);
  }
  
  /**
   * Get access to the system loader for inspection
   * @returns SystemLoader instance
   */
  getSystemLoader(): SystemLoader {
    return this.systemLoader;
  }
} 