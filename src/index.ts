// Core ECS exports
export { Entity, EntityAllocator } from './core/entity';
export { ComponentType, ComponentRegistry, componentRegistry } from './core/component';
export { ComponentMask } from './core/component-mask';
export { 
  ComponentArray, 
  GenericComponentArray, 
  NumericComponentArray, 
  ComponentArrayFactory, 
  ComponentArrayPool 
} from './core/component-storage';
export { Archetype } from './core/archetype';
export { 
  Query, 
  ExactQuery, 
  WithQuery, 
  WithoutQuery, 
  QueryBuilder, 
  ComplexQuery,
  QueryIterator,
  ComponentTuple 
} from './core/query';
export { 
  System, 
  SystemScheduler, 
  SystemPriority, 
  SystemInfo, 
  BaseSystem 
} from './core/system';
export { World } from './core/world';

// Import classes for the convenience object
import { World } from './core/world';
import { EntityAllocator } from './core/entity';
import { ComponentRegistry, componentRegistry } from './core/component';
import { ComponentMask } from './core/component-mask';
import { SystemScheduler, SystemPriority } from './core/system';

// Re-export for convenience
export const ECS = {
  World,
  EntityAllocator,
  ComponentRegistry,
  ComponentMask,
  SystemScheduler,
  SystemPriority,
  componentRegistry
};

// Version info
export const VERSION = '1.0.0';
