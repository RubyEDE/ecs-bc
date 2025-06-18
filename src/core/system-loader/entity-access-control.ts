import { Entity } from '../entity';
import { SystemId, EntityOwnership, Permission, CreateEntityOptions } from '../types';

/**
 * Entity access control manager for tracking ownership and permissions
 */
export class EntityAccessControl {
  private entityOwnership = new Map<number, EntityOwnership>();
  private systemEntityCounts = new Map<SystemId, number>();

  /**
   * Register a new entity with ownership
   */
  registerEntity(
    entity: Entity,
    systemId: SystemId,
    options: CreateEntityOptions = {}
  ): void {
    const ownership: EntityOwnership = {
      owner: options.owner || systemId,
      permissions: options.permissions || [Permission.READ, Permission.WRITE, Permission.DELETE],
      delegates: [],
      createdBy: systemId,
      createdAt: Date.now(),
    };

    this.entityOwnership.set(entity.id, ownership);

    // Track entity count per system
    const currentCount = this.systemEntityCounts.get(systemId) || 0;
    this.systemEntityCounts.set(systemId, currentCount + 1);
  }

  /**
   * Remove entity ownership tracking
   */
  unregisterEntity(entity: Entity): void {
    const ownership = this.entityOwnership.get(entity.id);
    if (ownership) {
      // Decrease entity count for the creating system
      const currentCount = this.systemEntityCounts.get(ownership.createdBy) || 0;
      if (currentCount > 0) {
        this.systemEntityCounts.set(ownership.createdBy, currentCount - 1);
      }

      this.entityOwnership.delete(entity.id);
    }
  }

  /**
   * Check if a system has permission to perform an operation on an entity
   */
  hasPermission(entity: Entity, systemId: SystemId, permission: Permission): boolean {
    const ownership = this.entityOwnership.get(entity.id);
    if (!ownership) {
      // Entity not tracked - default to no access
      return false;
    }

    // Owner has all permissions
    if (ownership.owner === systemId) {
      return true;
    }

    // Check if system is a delegate with the required permission
    if (ownership.delegates.includes(systemId)) {
      return ownership.permissions.includes(permission);
    }

    return false;
  }

  /**
   * Grant access to an entity for another system
   */
  grantAccess(
    entity: Entity,
    granter: SystemId,
    targetSystem: SystemId,
    permissions: Permission[]
  ): void {
    const ownership = this.entityOwnership.get(entity.id);
    if (!ownership) {
      throw new Error(`Entity ${entity.id} not found in access control`);
    }

    // Only owner or delegate with DELEGATE permission can grant access
    if (ownership.owner !== granter && 
        !(ownership.delegates.includes(granter) && ownership.permissions.includes(Permission.DELEGATE))) {
      throw new Error(`System '${granter}' does not have permission to grant access to entity ${entity.id}`);
    }

    // Add target system as delegate if not already
    if (!ownership.delegates.includes(targetSystem)) {
      ownership.delegates.push(targetSystem);
    }

    // Update permissions (union with existing permissions)
    for (const permission of permissions) {
      if (!ownership.permissions.includes(permission)) {
        ownership.permissions.push(permission);
      }
    }
  }

  /**
   * Revoke access from a system for an entity
   */
  revokeAccess(entity: Entity, revoker: SystemId, targetSystem: SystemId): void {
    const ownership = this.entityOwnership.get(entity.id);
    if (!ownership) {
      throw new Error(`Entity ${entity.id} not found in access control`);
    }

    // Only owner can revoke access
    if (ownership.owner !== revoker) {
      throw new Error(`System '${revoker}' does not have permission to revoke access to entity ${entity.id}`);
    }

    // Remove from delegates
    const delegateIndex = ownership.delegates.indexOf(targetSystem);
    if (delegateIndex >= 0) {
      ownership.delegates.splice(delegateIndex, 1);
    }
  }

  /**
   * Transfer ownership of an entity to another system
   */
  transferOwnership(entity: Entity, currentOwner: SystemId, newOwner: SystemId): void {
    const ownership = this.entityOwnership.get(entity.id);
    if (!ownership) {
      throw new Error(`Entity ${entity.id} not found in access control`);
    }

    // Only current owner can transfer ownership
    if (ownership.owner !== currentOwner) {
      throw new Error(`System '${currentOwner}' is not the owner of entity ${entity.id}`);
    }

    // Transfer ownership
    ownership.owner = newOwner;
    
    // Remove new owner from delegates if present
    const delegateIndex = ownership.delegates.indexOf(newOwner);
    if (delegateIndex >= 0) {
      ownership.delegates.splice(delegateIndex, 1);
    }
  }

  /**
   * Get ownership information for an entity
   */
  getOwnership(entity: Entity): EntityOwnership | undefined {
    return this.entityOwnership.get(entity.id);
  }

  /**
   * Get all entities owned by a system
   */
  getOwnedEntities(systemId: SystemId): number[] {
    const ownedEntities: number[] = [];
    
    for (const [entityId, ownership] of this.entityOwnership) {
      if (ownership.owner === systemId) {
        ownedEntities.push(entityId);
      }
    }
    
    return ownedEntities;
  }

  /**
   * Get all entities a system can read
   */
  getReadableEntities(systemId: SystemId): number[] {
    const readableEntities: number[] = [];
    
    for (const [entityId, ownership] of this.entityOwnership) {
      if (ownership.owner === systemId || 
          (ownership.delegates.includes(systemId) && ownership.permissions.includes(Permission.READ))) {
        readableEntities.push(entityId);
      }
    }
    
    return readableEntities;
  }

  /**
   * Get entities created by a system (not necessarily owned)
   */
  getCreatedEntities(systemId: SystemId): number[] {
    const createdEntities: number[] = [];
    
    for (const [entityId, ownership] of this.entityOwnership) {
      if (ownership.createdBy === systemId) {
        createdEntities.push(entityId);
      }
    }
    
    return createdEntities;
  }

  /**
   * Get entity count for a system
   */
  getSystemEntityCount(systemId: SystemId): number {
    return this.systemEntityCounts.get(systemId) || 0;
  }

  /**
   * Check if entity exists in access control
   */
  hasEntity(entity: Entity): boolean {
    return this.entityOwnership.has(entity.id);
  }

  /**
   * Validate access before operation
   */
  validateAccess(entity: Entity, systemId: SystemId, permission: Permission): void {
    if (!this.hasPermission(entity, systemId, permission)) {
      throw new Error(
        `System '${systemId}' does not have ${permission} permission for entity ${entity.id}`
      );
    }
  }

  /**
   * Get access control statistics
   */
  getStats(): {
    totalEntities: number;
    systemsWithEntities: number;
    averageEntitiesPerSystem: number;
    orphanedEntities: number;
  } {
    const totalEntities = this.entityOwnership.size;
    const systemsWithEntities = this.systemEntityCounts.size;
    const averageEntitiesPerSystem = systemsWithEntities > 0 
      ? totalEntities / systemsWithEntities 
      : 0;

    // Count orphaned entities (entities without valid owners)
    let orphanedEntities = 0;
    for (const ownership of this.entityOwnership.values()) {
      // This would need integration with system manager to check if owner system still exists
      // For now, assume all owners are valid
    }

    return {
      totalEntities,
      systemsWithEntities,
      averageEntitiesPerSystem,
      orphanedEntities,
    };
  }

  /**
   * Clean up entities for a removed system
   */
  cleanupSystemEntities(systemId: SystemId): void {
    const entitiesToRemove: number[] = [];
    
    for (const [entityId, ownership] of this.entityOwnership) {
      if (ownership.owner === systemId || ownership.createdBy === systemId) {
        entitiesToRemove.push(entityId);
      } else {
        // Remove system from delegates
        const delegateIndex = ownership.delegates.indexOf(systemId);
        if (delegateIndex >= 0) {
          ownership.delegates.splice(delegateIndex, 1);
        }
      }
    }

    // Remove entities owned or created by the system
    for (const entityId of entitiesToRemove) {
      this.entityOwnership.delete(entityId);
    }

    // Clear system entity count
    this.systemEntityCounts.delete(systemId);
  }

  /**
   * Clear all access control data
   */
  clear(): void {
    this.entityOwnership.clear();
    this.systemEntityCounts.clear();
  }
}

/**
 * Global entity access control instance
 */
export const entityAccessControl = new EntityAccessControl(); 