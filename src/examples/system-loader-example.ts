import { World } from '../core/world';
import { componentRegistry } from '../core/component';
import { SystemPriority } from '../core/system';

// Define some example components
interface Position {
  x: number;
  y: number;
}

interface Velocity {
  dx: number;
  dy: number;
}

interface Health {
  current: number;
  max: number;
}

// Register components
const PositionComponent = componentRegistry.register('Position', class PositionImpl implements Position {
  constructor(public x: number = 0, public y: number = 0) {}
});

const VelocityComponent = componentRegistry.register('Velocity', class VelocityImpl implements Velocity {
  constructor(public dx: number = 0, public dy: number = 0) {}
});

const HealthComponent = componentRegistry.register('Health', class HealthImpl implements Health {
  constructor(public current: number = 100, public max: number = 100) {}
});

/**
 * Example of using the SystemLoader to load user-defined systems
 */
export function systemLoaderExample(): void {
  console.log('=== SystemLoader Example ===');

  // Create world with SystemLoader
  const world = new World();

  // Create some test entities
  const entity1 = world.createEntity();
  world.addComponent(entity1, PositionComponent, new PositionComponent.constructor(10, 20));
  world.addComponent(entity1, VelocityComponent, new VelocityComponent.constructor(1, -1));

  const entity2 = world.createEntity();
  world.addComponent(entity2, PositionComponent, new PositionComponent.constructor(0, 0));
  world.addComponent(entity2, VelocityComponent, new VelocityComponent.constructor(2, 1));
  world.addComponent(entity2, HealthComponent, new HealthComponent.constructor(75, 100));

  // Example 1: Movement System
  const movementSystemSource = `
    const PositionComponent = getComponent('Position');
    const VelocityComponent = getComponent('Velocity');

    defineSystem('MovementSystem', {
      required: [PositionComponent, VelocityComponent],
      execute: (ctx, deltaTime) => {
        const entities = ctx.query(PositionComponent, VelocityComponent);
        
        ctx.iterate(entities, (entity) => {
          const position = ctx.get(entity, PositionComponent);
          const velocity = ctx.get(entity, VelocityComponent);
          
          if (position && velocity) {
            position.x += velocity.dx * deltaTime;
            position.y += velocity.dy * deltaTime;
            
            ctx.update(entity, PositionComponent, position);
            ctx.log('Moved entity to (' + position.x.toFixed(2) + ', ' + position.y.toFixed(2) + ')');
          }
        });
      }
    });
  `;

  // Example 2: Health Regeneration System
  const healthRegenSource = `
    const HealthComponent = getComponent('Health');

    defineSystem('HealthRegenSystem', {
      required: [HealthComponent],
      gasConfig: {
        maxGas: 5000,
        gasCosts: {
          componentUpdate: 1
        }
      },
      execute: (ctx, deltaTime) => {
        const entities = ctx.query(HealthComponent);
        
        ctx.iterate(entities, (entity) => {
          const health = ctx.get(entity, HealthComponent);
          
          if (health && health.current < health.max) {
            const newHealth = health.current + deltaTime * 10;
            health.current = newHealth > health.max ? health.max : newHealth;
            ctx.update(entity, HealthComponent, health);
            ctx.log('Health regenerated to ' + health.current.toFixed(1) + '/' + health.max);
          }
        });
      }
    });
  `;

  // Example 3: System with blocked operations (should fail)
  const maliciousSystemSource = `
    const PositionComponent = getComponent('Position');

    defineSystem('MaliciousSystem', {
      required: [PositionComponent],
      execute: (ctx, deltaTime) => {
        // This should be blocked by security validation
        const randomValue = Math.random();
        const currentTime = Date.now();
        ctx.log('This should not execute: ' + randomValue + currentTime);
      }
    });
  `;

  try {
    // Load and register movement system
    console.log('\nLoading movement system...');
    const movementSystemId = world.loadSystemFromSource(movementSystemSource, SystemPriority.NORMAL);
    console.log(`Movement system loaded with ID: ${movementSystemId}`);

    // Load and register health regeneration system
    console.log('\nLoading health regeneration system...');
    const healthRegenId = world.loadSystemFromSource(healthRegenSource, SystemPriority.LOW);
    console.log(`Health regen system loaded with ID: ${healthRegenId}`);

    // Try to load malicious system (should fail)
    console.log('\nTrying to load malicious system (should fail)...');
    try {
      world.loadSystemFromSource(maliciousSystemSource);
    } catch (error) {
      console.log(`✓ Security validation caught malicious code: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Run systems for a few frames
    console.log('\nRunning systems for 3 frames:');
    for (let frame = 0; frame < 3; frame++) {
      console.log(`\n--- Frame ${frame + 1} ---`);
      world.runSystems(0.016); // 60 FPS
    }

    // Show system statistics
    console.log('\n=== System Statistics ===');
    const loadedSystems = world.getAllLoadedSystems();
    for (const system of loadedSystems) {
      const loadResult = world.getSystemLoader().getLoadResult(system.name);
      if (loadResult) {
        console.log(`${system.name}: Load time ${loadResult.loadTime.toFixed(2)}ms`);
      }
    }

    // Show entity states
    console.log('\n=== Final Entity States ===');
    const entities = world.getAllEntities();
    for (const entity of entities) {
      const position = world.getComponent(entity, PositionComponent);
      const health = world.getComponent(entity, HealthComponent);
      
      let status = `Entity ${entity.id}: `;
      if (position) {
        status += `pos(${position.x.toFixed(2)}, ${position.y.toFixed(2)}) `;
      }
      if (health) {
        status += `health(${health.current.toFixed(1)}/${health.max}) `;
      }
      console.log(status);
    }

  } catch (error) {
    console.error('Error in system loader example:', error);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  systemLoaderExample();
} 