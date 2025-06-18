import { BaseSystem } from '../core/system';
import { World } from '../core/world';
import { Position, Velocity, Health, Timer, ComponentTypes } from './components';

/**
 * Movement system that updates entity positions based on velocity
 */
export class MovementSystem extends BaseSystem {
  constructor() {
    super('MovementSystem', [ComponentTypes.Position, ComponentTypes.Velocity]);
  }
  
  execute(world: World, deltaTime: number): void {
    const query = world.query(ComponentTypes.Position, ComponentTypes.Velocity);
    
    for (const [entity, position, velocity] of query.iter()) {
      position.x += velocity.x * deltaTime;
      position.y += velocity.y * deltaTime;
    }
  }
}

/**
 * Timer system that updates all timer components
 */
export class TimerSystem extends BaseSystem {
  constructor() {
    super('TimerSystem', [ComponentTypes.Timer]);
  }
  
  execute(world: World, deltaTime: number): void {
    const query = world.query(ComponentTypes.Timer);
    const entitiesToRemove: any[] = [];
    
    for (const [entity, timer] of query.iter()) {
      const finished = timer.update(deltaTime);
      
      // If timer finished and doesn't repeat, mark for removal
      if (finished && !timer.repeat) {
        entitiesToRemove.push(entity);
      }
    }
    
    // Remove finished timers
    for (const entity of entitiesToRemove) {
      world.removeComponent(entity, ComponentTypes.Timer);
    }
  }
}

/**
 * Health system that handles entity death
 */
export class HealthSystem extends BaseSystem {
  constructor() {
    super('HealthSystem', [ComponentTypes.Health]);
  }
  
  execute(world: World, deltaTime: number): void {
    const query = world.query(ComponentTypes.Health);
    const deadEntities: any[] = [];
    
    for (const [entity, health] of query.iter()) {
      if (health.isDead()) {
        deadEntities.push(entity);
      }
    }
    
    // Destroy dead entities
    for (const entity of deadEntities) {
      console.log(`Entity ${entity.id} died`);
      world.destroyEntity(entity);
    }
  }
}

/**
 * Debug system that logs entity information
 */
export class DebugSystem extends BaseSystem {
  private logInterval = 2.0; // Log every 2 seconds
  private timeSinceLastLog = 0;
  
  constructor() {
    super('DebugSystem', []);
  }
  
  execute(world: World, deltaTime: number): void {
    this.timeSinceLastLog += deltaTime;
    
    if (this.timeSinceLastLog >= this.logInterval) {
      this.logWorldState(world);
      this.timeSinceLastLog = 0;
    }
  }
  
  private logWorldState(world: World): void {
    const stats = world.getStats();
    console.log('=== World State ===');
    console.log(`Entities: ${stats.entityCount}`);
    console.log(`Archetypes: ${stats.archetypeCount}`);
    console.log(`Systems: ${stats.systemCount}`);
    console.log(`Frame: ${stats.frameCount}`);
    console.log(`Last frame time: ${stats.lastFrameTime.toFixed(2)}ms`);
    
    // Log some entity details
    const positionQuery = world.query(ComponentTypes.Position);
    console.log('Entities with Position:');
    
    let count = 0;
    for (const [entity, position] of positionQuery.iter()) {
      if (count < 5) { // Limit output
        console.log(`  Entity ${entity.id}: ${position.toString()}`);
        count++;
      }
    }
    
    if (positionQuery.count() > 5) {
      console.log(`  ... and ${positionQuery.count() - 5} more`);
    }
    
    console.log('==================');
  }
}

/**
 * Boundary system that keeps entities within bounds
 */
export class BoundarySystem extends BaseSystem {
  constructor(
    private minX: number = -100,
    private maxX: number = 100,
    private minY: number = -100,
    private maxY: number = 100
  ) {
    super('BoundarySystem', [ComponentTypes.Position]);
  }
  
  execute(world: World, deltaTime: number): void {
    const query = world.query(ComponentTypes.Position);
    
    for (const [entity, position] of query.iter()) {
      let changed = false;
      
      if (position.x < this.minX) {
        position.x = this.minX;
        changed = true;
      } else if (position.x > this.maxX) {
        position.x = this.maxX;
        changed = true;
      }
      
      if (position.y < this.minY) {
        position.y = this.minY;
        changed = true;
      } else if (position.y > this.maxY) {
        position.y = this.maxY;
        changed = true;
      }
      
      // Optionally reverse velocity when hitting boundary
      if (changed) {
        const velocity = world.getComponent(entity, ComponentTypes.Velocity);
        if (velocity) {
          if (position.x <= this.minX || position.x >= this.maxX) {
            velocity.x = -velocity.x;
          }
          if (position.y <= this.minY || position.y >= this.maxY) {
            velocity.y = -velocity.y;
          }
        }
      }
    }
  }
}

/**
 * Damage over time system
 */
export class DamageOverTimeSystem extends BaseSystem {
  constructor(private damagePerSecond: number = 10) {
    super('DamageOverTimeSystem', [ComponentTypes.Health, ComponentTypes.Timer]);
  }
  
  execute(world: World, deltaTime: number): void {
    // Find entities with both health and a damage timer
    const query = world.query(ComponentTypes.Health, ComponentTypes.Timer);
    
    for (const [entity, health, timer] of query.iter()) {
      // Apply damage based on timer progress
      const damage = this.damagePerSecond * deltaTime;
      health.takeDamage(damage);
    }
  }
} 