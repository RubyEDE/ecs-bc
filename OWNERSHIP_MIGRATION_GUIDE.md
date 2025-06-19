# ECS Ownership & Access Control Migration Guide

## Overview

This guide explains how to migrate your existing Entity Component System (ECS) to use the new ownership-based component access control system. The new system solves two critical issues:

1. **Component Naming Conflicts**: Multiple systems can no longer create components with identical names
2. **Unrestricted Component Access**: Systems can only modify components they own or have been granted access to

## Key Features

### ✅ Unique Component Naming
- Each system gets a unique identifier (e.g., `SYS001`, `SYS002`)
- Components are automatically renamed: `Player` → `Player_SYS001`
- Systems can still reference components by their original names

### ✅ Ownership-Based Access Control
- Only the owner system can modify components by default
- Granular read/write permissions
- Runtime access violation detection with helpful error messages

### ✅ Backward Compatibility
- Migration helper for existing systems
- Gradual migration support
- Existing code patterns can be preserved

## Quick Start

### 1. Basic Enhanced System

```typescript
import { EnhancedSystem, ComponentAccessPermissions } from './core';

class MySystem extends EnhancedSystem {
  private PlayerType!: ComponentType<Player>;

  constructor() {
    super('MySystem');
    this.initializeComponents();
  }

  private initializeComponents(): void {
    // Register a component with ownership
    this.PlayerType = this.registerOwnedComponent(
      'Player',           // Original name
      PlayerComponent,    // Constructor
      {                   // Access permissions (optional)
        readAll: true,    // All systems can read
        write: [],        // Only owner can write
        read: []          // Specific read access (if readAll is false)
      }
    );
  }

  execute(world: World, deltaTime: number): void {
    // Use safe component operations
    const players = this.querySafe(world, 'Player');
    
    for (const [entity, player] of players.iter()) {
      // Only this system can modify the player component
      this.updateComponentSafe<PlayerComponent>(
        world, entity, 'Player',
        (p) => p.addExperience(10)
      );
    }
  }
}
```

### 2. Component Access Permissions

```typescript
// Different permission patterns:

// 1. Public Read, Owner Write (Default)
this.registerOwnedComponent('Player', PlayerComponent, {
  readAll: true,
  write: []  // Owner added automatically
});

// 2. Restricted Access
this.registerOwnedComponent('Health', HealthComponent, {
  readAll: false,
  write: [],
  read: ['CombatSystem', 'HealingSystem']
});

// 3. Shared Write Access
this.registerOwnedComponent('Position', PositionComponent, {
  readAll: true,
  write: ['MovementSystem', 'PhysicsSystem']
});
```

### 3. Granting Access

```typescript
class PlayerSystem extends EnhancedSystem {
  // ... initialization code ...

  grantHealthAccess(): void {
    // Grant read access to health data
    this.grantComponentAccess('Health', 'CombatSystem', 'read');
    
    // Grant write access for healing
    this.grantComponentAccess('Health', 'HealingSystem', 'write');
  }
}
```

## Migration Process

### Step 1: Analyze Existing System

```typescript
import { migrationHelper } from './core';

// Analyze what needs to be migrated
const existingSystem = new YourExistingSystem();
const migrationPlan = migrationHelper.analyzeSystemForMigration(existingSystem, world);

console.log('Migration Plan:', migrationPlan);
// Shows: component names, access patterns, estimated changes
```

### Step 2: Convert System

```typescript
// Option A: Manual Migration (Recommended)
class YourSystemEnhanced extends EnhancedSystem {
  constructor() {
    super('YourSystem');
    // Register your components with ownership
    this.initializeComponents();
  }
  
  private initializeComponents(): void {
    this.registerOwnedComponent('YourComponent', YourComponent);
  }
  
  execute(world: World, deltaTime: number): void {
    // Replace direct world calls with safe operations
    const entities = this.querySafe(world, 'YourComponent');
    // ... rest of your logic
  }
}

// Option B: Automatic Migration (For complex systems)
const MigratedSystemClass = migrationHelper.convertToEnhancedSystem(
  YourExistingSystemClass,
  migrationPlan
);
```

### Step 3: Update Component Operations

Replace direct world operations with safe alternatives:

```typescript
// OLD: Direct world operations
world.addComponent(entity, ComponentType, component);
world.getComponent(entity, ComponentType);
world.removeComponent(entity, ComponentType);
const query = world.query(ComponentType1, ComponentType2);

// NEW: Safe operations with access control
this.addComponentSafe(world, entity, 'ComponentName', component);
this.getComponentSafe(world, entity, 'ComponentName');
this.removeComponentSafe(world, entity, 'ComponentName');
const query = this.querySafe(world, 'ComponentName1', 'ComponentName2');
```

## Error Handling

### Access Violation Errors

```typescript
import { ComponentAccessViolationError } from './core';

execute(world: World, deltaTime: number): void {
  try {
    // Component operations
    this.updateComponentSafe(world, entity, 'RestrictedComponent', (c) => {
      // This might fail if access is denied
    });
  } catch (error) {
    if (error instanceof ComponentAccessViolationError) {
      console.error('Access denied:', {
        reason: error.message,
        context: error.context,
        suggestion: error.suggestedAction
      });
      // Handle gracefully - skip operation, use fallback, etc.
      return;
    }
    throw error; // Re-throw other errors
  }
}
```

### Common Error Messages

```
Access denied: System 'CombatSystem' does not have write access to component 'Health' owned by 'PlayerSystem'
Suggested Action: Only the owner system can modify this component

Component 'NonExistentComponent' not found or not accessible
Suggested Action: Register the component or request access from the owner system
```

## Best Practices

### 1. Component Design

```typescript
// ✅ GOOD: Clear ownership and purpose
class PlayerHealthComponent {
  constructor(
    public maxHealth: number = 100,
    public currentHealth: number = 100
  ) {}
  
  // Methods that maintain component integrity
  takeDamage(amount: number): boolean {
    this.currentHealth = Math.max(0, this.currentHealth - amount);
    return this.currentHealth > 0;
  }
}

// ❌ AVOID: Generic components with unclear ownership
class DataComponent {
  public data: any = {};
}
```

### 2. System Architecture

```typescript
// ✅ GOOD: Clear system responsibilities
class PlayerManagementSystem extends EnhancedSystem {
  // Owns: Player, PlayerStats
  // Reads: None specifically
  // Writes: Only owned components
}

class CombatSystem extends EnhancedSystem {
  // Owns: Combat-specific components
  // Reads: Player, Health (with permission)
  // Writes: Damage events, combat state
}

// ❌ AVOID: Systems that try to own everything
class GodSystem extends EnhancedSystem {
  // Owns: Player, Health, Position, Inventory, etc. (too much)
}
```

### 3. Permission Strategy

```typescript
// ✅ GOOD: Granular permissions
{
  readAll: false,
  write: ['OwnerSystem'],
  read: ['SpecificSystem1', 'SpecificSystem2']
}

// ⚠️ CAREFUL: Overly permissive
{
  readAll: true,
  write: ['System1', 'System2', 'System3', 'System4'] // Maybe too many?
}
```

## Advanced Features

### Custom Access Control

```typescript
class AdvancedSystem extends EnhancedSystem {
  // Override for custom access logic
  protected checkCustomAccess(entity: Entity, operation: string): boolean {
    // Custom logic here
    return this.isEntityOwned(world, entity);
  }
}
```

### Dynamic Permission Management

```typescript
// Runtime permission changes
if (gameMode === 'debug') {
  playerSystem.grantComponentAccess('Health', 'DebugSystem', 'write');
} else {
  // Revoke debug access
}
```

### Migration Reports

```typescript
// Generate detailed migration analysis
const systems = [system1, system2, system3];
const plans = systems.map(s => migrationHelper.analyzeSystemForMigration(s, world));
const report = migrationHelper.generateMigrationReport(plans);

console.log(report);
// Detailed markdown report with warnings and recommendations
```

## Debugging and Monitoring

### Access Log

```typescript
// Get access attempts for debugging
const accessLog = enhancedComponentRegistry.getAccessLog();
console.log('Recent access attempts:', accessLog);

// Component registry statistics
const stats = enhancedComponentRegistry.getStats();
console.log('Registry stats:', stats);
```

### System Information

```typescript
// Check system's owned components
const ownedComponents = system.getOwnedComponents();
console.log('Owned components:', ownedComponents.map(c => ({
  original: c.originalName,
  unique: c.uniqueName,
  permissions: c.accessPermissions
})));

// Get system unique ID
const systemId = system.getSystemUniqueId();
console.log('System unique ID:', systemId);
```

## Performance Considerations

### ✅ Optimizations

1. **Component Caching**: The enhanced system caches component type lookups
2. **Batch Operations**: Access checks are performed once per component type per query
3. **Lazy Permission Checking**: Read permissions only checked when actually accessed

### ⚠️ Potential Overhead

1. **Access Control Checks**: Small overhead per component operation (~0.1ms)
2. **Name Resolution**: Component name mapping has minimal impact
3. **Memory Usage**: Registry maintains ownership metadata (~1KB per component type)

### Benchmarking

```typescript
// Measure performance impact
const startTime = performance.now();
system.execute(world, deltaTime);
const endTime = performance.now();
console.log(`System execution time: ${endTime - startTime}ms`);
```

## Troubleshooting

### Common Issues

1. **"Component not found"**: 
   - Ensure component is registered with `registerOwnedComponent`
   - Check component name spelling

2. **"Access denied"**:
   - Verify the system has proper permissions
   - Use `grantComponentAccess` to grant access

3. **"Migration errors"**:
   - Check for component name conflicts
   - Review migration plan warnings

### Debug Mode

```typescript
// Enable verbose logging
const world = new World({
  debug: true,
  logAccess: true
});
```

## Next Steps

1. **Start Small**: Migrate one system at a time
2. **Test Thoroughly**: Use the example systems as reference
3. **Monitor Performance**: Benchmark before and after migration
4. **Iterate**: Refine permissions based on actual usage patterns

## Support

For questions or issues:
1. Check the access log for permission errors
2. Review migration warnings in detail
3. Use the debugging tools provided
4. Refer to the example implementations

The ownership system provides a solid foundation for scalable, maintainable ECS architectures while maintaining performance and flexibility. 