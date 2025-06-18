import { World, SystemPriority } from '../index';
import { 
  Position, 
  Velocity, 
  Health, 
  Name, 
  Timer, 
  ComponentTypes 
} from './components';
import { 
  MovementSystem, 
  TimerSystem, 
  HealthSystem, 
  DebugSystem, 
  BoundarySystem, 
  DamageOverTimeSystem 
} from './systems';

/**
 * Basic ECS example demonstrating core functionality
 */
function runBasicExample(): void {
  console.log('Starting ECS Engine Basic Example...\n');
  
  // Create world
  const world = new World();
  
  // Add systems to world
  world.addSystem(new MovementSystem(), SystemPriority.HIGH);
  world.addSystem(new BoundarySystem(-50, 50, -50, 50), SystemPriority.NORMAL);
  world.addSystem(new TimerSystem(), SystemPriority.NORMAL);
  world.addSystem(new DamageOverTimeSystem(5), SystemPriority.NORMAL);
  world.addSystem(new HealthSystem(), SystemPriority.LOW);
  world.addSystem(new DebugSystem(), SystemPriority.LOWEST);
  
  // Initialize systems
  world.initializeSystems();
  
  // Create some entities
  createPlayerEntity(world);
  createEnemyEntities(world, 5);
  createProjectileEntities(world, 10);
  
  console.log(`Created entities: ${world.getStats().entityCount}\n`);
  
  // Run simulation for 10 seconds
  const totalTime = 10.0;
  const deltaTime = 1/60; // 60 FPS
  let currentTime = 0;
  
  while (currentTime < totalTime) {
    world.runSystems(deltaTime);
    currentTime += deltaTime;
  }
  
  console.log('\nFinal world state:');
  console.log(world.getStats());
  
  // Clean up
  world.clear();
  console.log('Example completed.');
}

/**
 * Create a player entity with full component set
 */
function createPlayerEntity(world: World): void {
  const player = world.createEntity();
  
  world.addComponent(player, ComponentTypes.Position, new Position(0, 0));
  world.addComponent(player, ComponentTypes.Velocity, new Velocity(10, 5));
  world.addComponent(player, ComponentTypes.Health, new Health(100, 100));
  world.addComponent(player, ComponentTypes.Name, new Name('Player'));
  
  console.log(`Created player entity ${player.id}`);
}

/**
 * Create enemy entities
 */
function createEnemyEntities(world: World, count: number): void {
  for (let i = 0; i < count; i++) {
    const enemy = world.createEntity();
    
    // Random position and velocity
    const x = (Math.random() - 0.5) * 100;
    const y = (Math.random() - 0.5) * 100;
    const vx = (Math.random() - 0.5) * 20;
    const vy = (Math.random() - 0.5) * 20;
    
    world.addComponent(enemy, ComponentTypes.Position, new Position(x, y));
    world.addComponent(enemy, ComponentTypes.Velocity, new Velocity(vx, vy));
    world.addComponent(enemy, ComponentTypes.Health, new Health(50, 50));
    world.addComponent(enemy, ComponentTypes.Name, new Name(`Enemy${i + 1}`));
    
    // Some enemies have damage over time
    if (Math.random() < 0.5) {
      world.addComponent(enemy, ComponentTypes.Timer, new Timer(5.0, 0, true)); // 5 second DoT timer
    }
  }
  
  console.log(`Created ${count} enemy entities`);
}

/**
 * Create projectile entities (just position and velocity)
 */
function createProjectileEntities(world: World, count: number): void {
  for (let i = 0; i < count; i++) {
    const projectile = world.createEntity();
    
    // Random position and fast velocity
    const x = (Math.random() - 0.5) * 50;
    const y = (Math.random() - 0.5) * 50;
    const vx = (Math.random() - 0.5) * 100;
    const vy = (Math.random() - 0.5) * 100;
    
    world.addComponent(projectile, ComponentTypes.Position, new Position(x, y));
    world.addComponent(projectile, ComponentTypes.Velocity, new Velocity(vx, vy));
    world.addComponent(projectile, ComponentTypes.Timer, new Timer(3.0, 0, false)); // 3 second lifetime
  }
  
  console.log(`Created ${count} projectile entities`);
}

// Run the example
runBasicExample(); 