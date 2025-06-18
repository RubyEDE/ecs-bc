import { World } from '../world';
import { Entity } from '../entity';
import { ComponentType } from '../component';
import { Query } from '../query';
import { GasTracker } from './gas-tracker';

/**
 * Secure system execution context with gas tracking and access control
 */
export class SystemContext {
  private readonly world: World;
  private readonly gasTracker: GasTracker;
  private readonly allowedComponents: Set<number>;
  private readonly systemName: string;

  constructor(
    world: World,
    gasTracker: GasTracker,
    allowedComponents: ComponentType[],
    systemName: string
  ) {
    this.world = world;
    this.gasTracker = gasTracker;
    this.allowedComponents = new Set(allowedComponents.map(c => c.id));
    this.systemName = systemName;
  }

  /**
   * Query entities with specified components
   */
  query<T extends readonly ComponentType[]>(...componentTypes: T): Query<T> {
    this.gasTracker.consumeGas('entityQuery');
    this.validateComponentAccess(componentTypes);
    return this.world.query(...componentTypes);
  }

  /**
   * Get a component from an entity
   */
  get<T>(entity: Entity, componentType: ComponentType<T>): T | undefined {
    this.gasTracker.consumeGas('componentAccess');
    this.validateComponentAccess([componentType]);
    return this.world.getComponent(entity, componentType);
  }

  /**
   * Check if entity has a component
   */
  has<T>(entity: Entity, componentType: ComponentType<T>): boolean {
    this.gasTracker.consumeGas('componentAccess');
    this.validateComponentAccess([componentType]);
    return this.world.hasComponent(entity, componentType);
  }

  /**
   * Update a component on an entity
   */
  update<T>(entity: Entity, componentType: ComponentType<T>, component: T): void {
    this.gasTracker.consumeGas('componentUpdate');
    this.validateComponentAccess([componentType]);
    this.world.addComponent(entity, componentType, component);
  }

  /**
   * Create a new entity
   */
  createEntity(): Entity {
    this.gasTracker.consumeGas('entityCreate');
    return this.world.createEntity();
  }

  /**
   * Destroy an entity
   */
  destroyEntity(entity: Entity): void {
    this.gasTracker.consumeGas('entityDestroy');
    this.world.destroyEntity(entity);
  }

  /**
   * Get current gas usage
   */
  getGasUsed(): number {
    return this.gasTracker.getGasUsed();
  }

  /**
   * Get remaining gas
   */
  getRemainingGas(): number {
    return this.gasTracker.getRemainingGas();
  }

  /**
   * Iterate with gas tracking
   */
  iterate<T>(iterable: Iterable<T>, callback: (item: T, index: number) => void | boolean): void {
    let index = 0;
    
    // Handle Query objects specifically
    if (iterable && typeof (iterable as any).entities === 'function') {
      const query = iterable as any;
      const entities = query.entities();
      for (const entity of entities) {
        this.gasTracker.consumeGas('iteration');
        
        const result = callback(entity as T, index);
        if (result === false) {
          break;
        }
        index++;
      }
    } else {
      // Handle regular iterables
      for (const item of iterable) {
        this.gasTracker.consumeGas('iteration');
        
        const result = callback(item, index);
        if (result === false) {
          break;
        }
        index++;
      }
    }
  }

  /**
   * Log message (allowed operation)
   */
  log(...args: any[]): void {
    console.log(`[${this.systemName}]`, ...args);
  }

  /**
   * Validate that system can access specified components
   */
  private validateComponentAccess(componentTypes: readonly ComponentType[]): void {
    for (const componentType of componentTypes) {
      if (!this.allowedComponents.has(componentType.id)) {
        throw new Error(
          `System '${this.systemName}' does not have access to component '${componentType.name}'`
        );
      }
    }
  }
} 