import { World, SystemPriority } from '../index';
import { Position, Velocity, ComponentTypes } from './components';
import { MovementSystem } from './systems';

/**
 * Simple ECS example with minimal setup
 */
function runSimpleExample(): void {
  console.log('Starting Simple ECS Example...\n');
  
  // Create world
  const world = new World();
  
  // Create entity
  const entity = world.createEntity();
  console.log(`Created entity ${entity.id}`);
  
  // Add components one by one
  console.log('Adding Position component...');
  world.addComponent(entity, ComponentTypes.Position, new Position(0, 0));
  
  console.log('Adding Velocity component...');
  world.addComponent(entity, ComponentTypes.Velocity, new Velocity(10, 5));
  
  // Test component retrieval
  const position = world.getComponent(entity, ComponentTypes.Position);
  const velocity = world.getComponent(entity, ComponentTypes.Velocity);
  
  console.log(`Position: ${position?.toString()}`);
  console.log(`Velocity: ${velocity?.toString()}`);
  
  // Test query
  console.log('\nTesting query...');
  const query = world.query(ComponentTypes.Position, ComponentTypes.Velocity);
  
  console.log(`Query count: ${query.count()}`);
  
  for (const [queryEntity, queryPosition, queryVelocity] of query.iter()) {
    console.log(`Query result - Entity ${queryEntity.id}: ${queryPosition.toString()}, ${queryVelocity.toString()}`);
  }
  
  // Add system and test
  console.log('\nAdding movement system...');
  world.addSystem(new MovementSystem());
  
  // Run one frame
  console.log('Running one system frame...');
  world.runSystems(1.0); // 1 second delta time
  
  // Check updated position
  const updatedPosition = world.getComponent(entity, ComponentTypes.Position);
  console.log(`Updated position: ${updatedPosition?.toString()}`);
  
  console.log('\nSimple example completed.');
}

// Run example
runSimpleExample(); 