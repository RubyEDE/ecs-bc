import { World } from './src/core/world';
import { enhancedComponentRegistry } from './src/core/component-registry';
import { PlayerManagementSystem, CombatSystem, demonstrateOwnershipSystem } from './src/core/systems/example-migrated-system';

/**
 * Example usage of the ECS Ownership System
 */
function main() {
  console.log('🚀 Starting ECS Ownership System Demo...\n');

  // Create a new world
  const world = new World();

  // Run the demonstration
  demonstrateOwnershipSystem(world);

  // Show final registry statistics
  console.log('\n📊 Final Registry Statistics:');
  const stats = enhancedComponentRegistry.getStats();
  console.log(JSON.stringify(stats, null, 2));

  // Show access log (if any)
  const accessLog = enhancedComponentRegistry.getAccessLog();
  if (accessLog.length > 0) {
    console.log('\n📝 Access Log:');
    accessLog.slice(-5).forEach(entry => {
      console.log(`[${new Date(entry.timestamp).toISOString()}] ${entry.operation} by ${entry.systemId}: ${entry.componentName}`);
    });
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  main();
}

export { main as runOwnershipDemo }; 