import { World } from '../index';
import { Position, ComponentTypes } from './components';

/**
 * Simple debug test to isolate the issue
 */
function debugTest(): void {
  console.log('=== Debug Test ===');
  
  const world = new World();
  
  console.log('Creating entity...');
  const entity = world.createEntity();
  console.log(`Entity created: ${entity.id}:${entity.generation}`);
  
  console.log('Creating Position component...');
  const position = new Position(10, 20);
  console.log(`Position component: ${position.toString()}`);
  
  console.log('Component type info:');
  console.log(`Position type ID: ${ComponentTypes.Position.id}`);
  console.log(`Position type name: ${ComponentTypes.Position.name}`);
  
  console.log('Adding component to entity...');
  try {
    world.addComponent(entity, ComponentTypes.Position, position);
    console.log('Component added successfully!');
    
    // Try to get the component back
    const retrievedPosition = world.getComponent(entity, ComponentTypes.Position);
    console.log(`Retrieved position: ${retrievedPosition?.toString()}`);
    
  } catch (error) {
    console.error('Error adding component:', error);
  }
  
  console.log('=== End Debug Test ===');
}

// Run debug test
debugTest(); 