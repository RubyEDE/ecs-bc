// Core ECS exports
export * from './core';

// Examples
export { systemLoaderExample } from './examples/system-loader-example';

// Re-export key types for convenience
export type { Entity } from './core/entity';
export type { ComponentType } from './core/component';
export type { System } from './core/system';
export { World } from './core/world';
export type { UserSystemDefinition, SystemLoaderConfig } from './core/system-loader';

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
