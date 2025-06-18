import { World, componentRegistry } from '../core';
import { 
  EnhancedSystemContext,
  SystemLoader,
  dynamicComponentRegistry,
  entityAccessControl,
  systemMetricsCollector,
  eventSystem,
} from '../core/system-loader';
import { Permission } from '../core/types';

/**
 * Comprehensive example demonstrating the enhanced ECS + VM system
 */

// Example: Game system with player management
const playerSystemCode = `
defineSystem('PlayerSystem', {
  required: [],
  
  init: (ctx) => {
    // Define Player component with schema validation
    ctx.defineComponent('Player', {
      version: 1,
      fields: {
        name: { type: 'string', required: true, min: 1, max: 50 },
        level: { type: 'number', required: true, min: 1, max: 100 },
        health: { type: 'number', required: true, min: 0, max: 100 },
        position: { 
          type: 'object', 
          required: true,
          nested: {
            version: 1,
            fields: {
              x: { type: 'number', required: true },
              y: { type: 'number', required: true },
              z: { type: 'number', required: true }
            }
          }
        }
      },
      maxSize: 1024
    });

    ctx.log('PlayerSystem initialized with Player component schema');
    
    // Subscribe to game events
    ctx.subscribe('PlayerJoined', (event) => {
      ctx.log('New player joined:', event.data);
    });
  },

  execute: (ctx, deltaTime) => {
    // Create a test player entity
    const playerEntity = ctx.createEntity({ 
      metadata: { type: 'player' }
    });
    
    // Add player component with validated data
    ctx.addComponent(playerEntity, 'Player', {
      name: 'TestPlayer',
      level: 1,
      health: 100,
      position: { x: 0, y: 0, z: 0 }
    });

    // Query for all players
    const players = ctx.query(['Player'])
      .ownedBy(ctx.getMySystemId())
      .limit(10)
      .execute();

    ctx.log(\`Found \${players.length} players owned by this system\`);

    // Emit player update event
    ctx.emit('PlayerUpdated', {
      playerId: playerEntity.id,
      health: 100
    });

    // Check resource usage
    const usage = ctx.getResourceUsage();
    if (usage.gasUsed > 5000) {
      ctx.warn('High gas usage detected:', usage.gasUsed);
    }
  }
});
`;

// Example: Combat system that interacts with players
const combatSystemCode = `
defineSystem('CombatSystem', {
  required: [],
  
  init: (ctx) => {
    // Define Weapon component
    ctx.defineComponent('Weapon', {
      version: 1,
      fields: {
        damage: { type: 'number', required: true, min: 1, max: 1000 },
        durability: { type: 'number', required: true, min: 0, max: 100 },
        type: { type: 'string', required: true, pattern: /^(sword|bow|staff)$/ }
      }
    });

    // Subscribe to player events
    ctx.subscribe('PlayerUpdated', (event) => {
      ctx.log('Player health updated:', event.data);
    });
    
    ctx.log('CombatSystem initialized');
  },

  execute: (ctx, deltaTime) => {
    // Try to query for players (will fail due to access control)
    try {
      const allPlayers = ctx.query(['Player']).execute();
      ctx.log(\`Combat system can see \${allPlayers.length} players\`);
    } catch (error) {
      ctx.log('Cannot access Player components - need permission');
    }

    // Create weapon entities
    const swordEntity = ctx.createEntity();
    ctx.addComponent(swordEntity, 'Weapon', {
      damage: 50,
      durability: 80,
      type: 'sword'
    });

    ctx.log('Created sword weapon');
  }
});
`;

export async function demonstrateEnhancedECS(): Promise<void> {
  console.log('🚀 Starting Enhanced ECS + VM Demonstration\n');

  // Initialize World and System Loader
  const world = new World();
  const systemLoader = new SystemLoader();

  try {
    // ===== 1. LOAD SYSTEMS WITH UNIQUE IDs =====
    console.log('📦 Loading Systems with unique deployment IDs...');
    
    // Generate unique deployment instances
    const deploymentTimestamp = Date.now();
    
    const playerSystem = systemLoader.loadFromSource(
      playerSystemCode, 
      'player-system.ts',
      { instanceSuffix: `demo_${deploymentTimestamp}` }
    );
    
    const combatSystem = systemLoader.loadFromSource(
      combatSystemCode, 
      'combat-system.ts',
      { instanceSuffix: `demo_${deploymentTimestamp}` }
    );

    console.log(`✅ PlayerSystem deployed as: ${playerSystem.name}`);
    console.log(`✅ CombatSystem deployed as: ${combatSystem.name}`);

    // Add systems to world
    world.addSystem(playerSystem);
    world.addSystem(combatSystem);

    console.log('✅ Systems loaded successfully\n');

    // ===== 2. INITIALIZE SYSTEMS =====
    console.log('🔧 Initializing Systems...');
    world.initializeSystems();
    console.log('✅ Systems initialized\n');

    // ===== 3. RUN SYSTEM EXECUTION =====
    console.log('⚡ Running System Execution...');
    world.runSystems(16); // 16ms delta time
    console.log('✅ Systems executed\n');

    // ===== 4. DEMONSTRATE ACCESS CONTROL =====
    console.log('🔒 Demonstrating Access Control...');
    
    // Get a player entity from the player system (using dynamic system ID)
    const playerEntities = entityAccessControl.getOwnedEntities(playerSystem.name);
    if (playerEntities.length > 0) {
      const playerId = playerEntities[0];
      const playerEntity = { id: playerId, generation: 0 };
      
      console.log(`Player entity ${playerId} owned by ${playerSystem.name}`);
      
      // Grant read access to combat system
      console.log('Granting read access to CombatSystem...');
      entityAccessControl.grantAccess(
        playerEntity,
        playerSystem.name,
        combatSystem.name,
        [Permission.READ]
      );
      
      // Verify permission
      const hasPermission = entityAccessControl.hasPermission(
        playerEntity,
        combatSystem.name,
        Permission.READ
      );
      console.log(`${combatSystem.name} can read player: ${hasPermission}`);
    }
    console.log('✅ Access control demonstrated\n');

    // ===== 5. DEMONSTRATE EVENT SYSTEM =====
    console.log('📡 Demonstrating Event System...');
    
    // Emit cross-system event
    eventSystem.emit(playerSystem.name, 'PlayerJoined', {
      playerId: 'player_123',
      name: 'NewPlayer'
    });
    
    // Get event statistics
    const eventStats = eventSystem.getStats();
    console.log('Event system stats:', eventStats);
    console.log('✅ Event system demonstrated\n');

    // ===== 6. DEMONSTRATE DYNAMIC COMPONENTS =====
    console.log('🧩 Demonstrating Dynamic Components...');
    
    const componentStats = dynamicComponentRegistry.getStats();
    console.log('Dynamic component stats:', componentStats);
    
    // List components created by each system
    const playerComponents = dynamicComponentRegistry.getSystemComponents(playerSystem.name);
    const combatComponents = dynamicComponentRegistry.getSystemComponents(combatSystem.name);
    
    console.log('Player system components:', playerComponents.map(c => c.originalName));
    console.log('Combat system components:', combatComponents.map(c => c.originalName));
    console.log('✅ Dynamic components demonstrated\n');

    // ===== 7. DEMONSTRATE PERFORMANCE MONITORING =====
    console.log('📊 Demonstrating Performance Monitoring...');
    
    const playerMetrics = systemMetricsCollector.getSystemMetrics(playerSystem.name);
    const combatMetrics = systemMetricsCollector.getSystemMetrics(combatSystem.name);
    
    console.log('Player system metrics:', {
      executions: playerMetrics?.executionCount,
      avgTime: playerMetrics?.averageExecutionTime,
      gasUsed: playerMetrics?.gasUsed,
      entitiesCreated: playerMetrics?.entitiesCreated
    });
    
    console.log('Combat system metrics:', {
      executions: combatMetrics?.executionCount,
      avgTime: combatMetrics?.averageExecutionTime,
      gasUsed: combatMetrics?.gasUsed,
      entitiesCreated: combatMetrics?.entitiesCreated
    });

    // Get performance rankings
    const rankings = systemMetricsCollector.getSystemRankings();
    console.log('System rankings by gas usage:', rankings.byGasUsage);
    
    const overallStats = systemMetricsCollector.getOverallStats();
    console.log('Overall system stats:', overallStats);
    console.log('✅ Performance monitoring demonstrated\n');

    // ===== 8. DEMONSTRATE ENTITY ACCESS CONTROL =====
    console.log('🔐 Demonstrating Entity Access Control...');
    
    const accessStats = entityAccessControl.getStats();
    console.log('Entity access control stats:', accessStats);
    
    const playerSystemEntities = entityAccessControl.getOwnedEntities(playerSystem.name);
    const combatSystemEntities = entityAccessControl.getOwnedEntities(combatSystem.name);
    
    console.log(`PlayerSystem owns ${playerSystemEntities.length} entities`);
    console.log(`CombatSystem owns ${combatSystemEntities.length} entities`);
    console.log('✅ Entity access control demonstrated\n');

    // ===== 9. WORLD STATISTICS =====
    console.log('🌍 World Statistics...');
    const worldStats = world.getStats();
    console.log('World stats:', worldStats);
    console.log('✅ World statistics displayed\n');

    // ===== 10. CLEANUP DEMONSTRATION =====
    console.log('🧹 Demonstrating System Cleanup...');
    
    console.log('Original system names preserved as metadata:');
    console.log(`  Player: ${(playerSystem as any).originalName} -> ${playerSystem.name}`);
    console.log(`  Combat: ${(combatSystem as any).originalName} -> ${combatSystem.name}`);
    
    // Show that same system code can be loaded again with different ID
    const playerSystem2 = systemLoader.loadFromSource(
      playerSystemCode, 
      'player-system.ts',
      { instanceSuffix: `second_instance` }
    );
    console.log(`✅ Second PlayerSystem instance deployed as: ${playerSystem2.name}`);
    
    console.log('✅ System cleanup demonstrated\n');

    console.log('🎉 Enhanced ECS + VM demonstration completed successfully!');
    console.log('💡 Each system deployment gets a unique ID, preventing conflicts!');
    
  } catch (error) {
    console.error('❌ Error during demonstration:', error);
  }
}

// Export the demonstration function
if (require.main === module) {
  demonstrateEnhancedECS().catch(console.error);
} 