import { componentRegistry } from '../component';

/**
 * Ownership component declaring which entity owns another
 * This component establishes ownership relationships between entities
 */
export class OwnershipComponent {
  constructor(
    public ownerId: number,
    public previousOwnerId?: number,
    public createdAt: number = Date.now(),
    public transferable: boolean = true
  ) {}

  /**
   * Check if ownership can be transferred
   */
  isTransferable(): boolean {
    return this.transferable;
  }

  /**
   * Check if ownership can be transferred to a specific entity
   * This method can be extended with custom business rules
   * @param toEntityId The target entity ID to transfer to
   * @returns True if transfer is allowed
   */
  canTransfer(toEntityId: number): boolean {
    // Basic checks
    if (!this.transferable) {
      return false;
    }

    // Cannot transfer to the same owner
    if (toEntityId === this.ownerId) {
      return false;
    }

    // Cannot transfer to invalid entity (negative or zero ID)
    if (toEntityId <= 0) {
      return false;
    }

    return true;
  }

  /**
   * Transfer ownership to a new entity
   */
  transferTo(newOwnerId: number): void {
    if (!this.canTransfer(newOwnerId)) {
      throw new Error(`Cannot transfer ownership to entity ${newOwnerId}`);
    }
    
    this.previousOwnerId = this.ownerId;
    this.ownerId = newOwnerId;
  }

  /**
   * Check if this entity has had previous owners
   */
  hasPreviousOwner(): boolean {
    return this.previousOwnerId !== undefined;
  }

  /**
   * Get the age of this ownership in milliseconds
   */
  getAge(): number {
    return Date.now() - this.createdAt;
  }

  /**
   * Get the age of this ownership in seconds
   */
  getAgeInSeconds(): number {
    return Math.floor(this.getAge() / 1000);
  }

  toString(): string {
    const prevOwner = this.previousOwnerId ? `, prev: ${this.previousOwnerId}` : '';
    const transferableStr = this.transferable ? 'transferable' : 'non-transferable';
    return `OwnershipComponent(owner: ${this.ownerId}${prevOwner}, ${transferableStr})`;
  }
}

// Register the component type
export const OwnershipComponentType = componentRegistry.register('OwnershipComponent', OwnershipComponent);

// Export component type for easy access
export const OwnershipComponentTypes = {
  OwnershipComponent: OwnershipComponentType
};
