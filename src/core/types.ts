// Core type definitions for enhanced ECS + VM system

export type SystemId = string;
export type EntityId = number;
export type ComponentId = number;
export type SubscriptionId = string;

/**
 * Permission types for access control
 */
export enum Permission {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  EXECUTE = 'execute',
  DELEGATE = 'delegate',
  TRANSFER = 'transfer',
}

/**
 * Component schema definition for validation
 */
export interface ComponentSchema {
  version: number;
  fields: Record<string, FieldDefinition>;
  constraints?: Constraint[];
  maxSize?: number;
}

export interface FieldDefinition {
  type: 'number' | 'string' | 'boolean' | 'object' | 'array';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  nested?: ComponentSchema;
}

export interface Constraint {
  type: 'unique' | 'range' | 'pattern' | 'custom';
  field: string;
  value?: any;
  validator?: (value: any) => boolean;
}

/**
 * System User Component - automatically created for each system
 */
export interface SystemUserComponent {
  systemId: SystemId;
  name: string;
  version: string;
  deployedAt: number;
  permissions: Permission[];
  resourceLimits: ResourceLimits;
  metadata: Record<string, any>;
}

/**
 * Entity ownership information
 */
export interface EntityOwnership {
  owner: SystemId;
  permissions: Permission[];
  delegates: SystemId[];
  createdBy: SystemId;
  createdAt: number;
}

/**
 * Resource limits for systems
 */
export interface ResourceLimits {
  maxEntities: number;
  maxComponents: number;
  maxMemoryMB: number;
  gasLimit: number;
  executionTimeoutMs: number;
}

/**
 * Gas costs for different operations
 */
export interface GasCosts {
  createEntity: number;
  deleteEntity: number;
  addComponent: number;
  updateComponent: number;
  removeComponent: number;
  queryEntities: number;
  defineComponent: number;
  crossSystemCall: number;
  eventEmit: number;
  eventSubscribe: number;
}

/**
 * Current resource usage for a system
 */
export interface ResourceUsage {
  entitiesCreated: number;
  componentsCreated: number;
  memoryUsageMB: number;
  gasUsed: number;
  executionTimeMs: number;
}

/**
 * System metrics for monitoring
 */
export interface SystemMetrics {
  executionCount: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  gasUsed: number;
  entitiesCreated: number;
  componentsCreated: number;
  memoryUsage: number;
  errorCount: number;
  lastError?: string;
  lastExecutionTime: number;
}

/**
 * System information for discovery (renamed to avoid conflicts)
 */
export interface SystemDetails {
  id: SystemId;
  name: string;
  version: string;
  deployedAt: number;
  isActive: boolean;
  resourceUsage: ResourceUsage;
  metrics: SystemMetrics;
  permissions: Permission[];
  metadata: Record<string, any>;
}

/**
 * Event system types
 */
export interface EventHandler {
  (event: SystemEvent): void;
}

export interface SystemEvent {
  type: string;
  data: any;
  emitter: SystemId;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface EmitOptions {
  targetSystems?: SystemId[];
  broadcast?: boolean;
  persistent?: boolean;
  priority?: number;
}

/**
 * Entity creation options
 */
export interface CreateEntityOptions {
  owner?: SystemId;
  metadata?: Record<string, any>;
  permissions?: Permission[];
}

/**
 * Component registration information
 */
export interface ComponentRegistration {
  id: ComponentId;
  hashedId: string;
  originalName: string;
  systemId: SystemId;
  schema: ComponentSchema;
  createdAt: number;
}

/**
 * Debug utilities for development
 */
export interface EntitySnapshot {
  entity: { id: number; generation: number };
  components: Array<{
    name: string;
    data: any;
    componentId: ComponentId;
  }>;
  ownership: EntityOwnership;
  metadata: Record<string, any>;
}

export interface ComponentSnapshot {
  id: ComponentId;
  name: string;
  schema: ComponentSchema;
  systemId: SystemId;
  entityCount: number;
  totalMemoryUsage: number;
}

export interface ExecutionTrace {
  timestamp: number;
  operation: string;
  systemId: SystemId;
  entityId?: EntityId;
  componentId?: ComponentId;
  gasUsed: number;
  duration: number;
  success: boolean;
  error?: string;
}

/**
 * Enhanced query builder types
 */
export interface QueryBuilderFilter {
  component: string;
  field?: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'exists';
  value?: any;
}

export interface QueryBuilderOptions {
  ownedBy?: SystemId;
  readableBy?: SystemId;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
} 