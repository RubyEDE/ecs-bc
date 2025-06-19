// Original exports
export * from './world';
export * from './entity';
export * from './component';
export * from './component-mask';
export * from './component-storage';
export * from './archetype';
export * from './query';
export * from './system';
export * from './system-loader';

// Export types but exclude conflicting ComponentRegistration
export {
  SystemId,
  EntityId,
  ComponentId,
  SubscriptionId,
  Permission,
  ComponentSchema,
  FieldDefinition,
  Constraint,
  SystemUserComponent,
  EntityOwnership,
  ResourceLimits,
  GasCosts,
  ResourceUsage,
  SystemMetrics,
  SystemDetails,
  EventHandler,
  SystemEvent,
  EmitOptions,
  CreateEntityOptions,
  EntitySnapshot,
  ComponentSnapshot,
  ExecutionTrace,
  QueryBuilderFilter,
  QueryBuilderOptions
} from './types';

// New ownership and access control exports with enhanced ComponentRegistration
export * from './component-registry';
export * from './enhanced-system';
export * from './migration-helper';

// Component exports
export * from './components/ownership-component';
export * from './components/user-component'; 