import { ComponentArrayPool, GenericComponentArray } from '../core/component-storage';
import { Archetype } from '../core/archetype';
import { ComponentTypes, Position } from './components';
import { EntityAllocator } from '../core/entity';

/**
 * Debug component storage mechanism
 */
function debugComponentStorage(): void {
  console.log('=== Component Storage Debug ===');
  
  // Test component array directly
  console.log('Testing component array...');
  const componentArray = new GenericComponentArray<Position>();
  const position1 = new Position(10, 20);
  
  componentArray.push(position1);
  const retrieved = componentArray.get(0);
  console.log(`Stored: ${position1.toString()}`);
  console.log(`Retrieved: ${retrieved?.toString()}`);
  
  // Test archetype directly
  console.log('\nTesting archetype...');
  const pool = new ComponentArrayPool();
  const archetype = new Archetype([ComponentTypes.Position], pool);
  
  const entityAllocator = new EntityAllocator();
  const entity = entityAllocator.allocate();
  
  const componentData = new Map<number, any>();
  componentData.set(ComponentTypes.Position.id, position1);
  
  console.log(`Adding entity ${entity.id} to archetype`);
  console.log(`Component data:`, Array.from(componentData.entries()));
  console.log(`Position type ID: ${ComponentTypes.Position.id}`);
  
  try {
    archetype.addEntity(entity, componentData);
    console.log('Entity added successfully');
    
    const retrievedFromArchetype = archetype.getComponent(entity, ComponentTypes.Position);
    console.log(`Retrieved from archetype: ${retrievedFromArchetype?.toString()}`);
    
    // Test archetype iteration
    console.log('Testing archetype iteration...');
    for (const [iterEntity, iterPosition] of archetype.iterate()) {
      console.log(`Iteration - Entity ${iterEntity.id}: ${iterPosition?.toString()}`);
    }
    
  } catch (error) {
    console.error('Error adding entity to archetype:', error);
  }
  
  console.log('=== End Component Storage Debug ===');
}

// Run debug
debugComponentStorage(); 