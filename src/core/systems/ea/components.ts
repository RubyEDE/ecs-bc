import { componentRegistry } from '../../component';

/**
 * Base asset metadata component
 */
export class AssetMetadata {
  constructor(
    public name: string = '',
    public symbol: string = '',
    public description: string = '',
    public imageUrl: string = '',
    public attributes: Record<string, any> = {}
  ) {}

  toString(): string {
    return `AssetMetadata("${this.name}", "${this.symbol}")`;
  }
}

/**
 * Asset ownership component - tracks who owns an asset
 */
export class AssetOwnership {
  constructor(
    public ownerId: number, // Entity ID of the owner
    public previousOwnerId?: number // Previous owner for transfer history
  ) {}

  toString(): string {
    return `AssetOwnership(owner: ${this.ownerId}, prev: ${this.previousOwnerId})`;
  }
}

/**
 * Asset registry component - tracks asset type and registration info
 */
export class AssetRegistry {
  constructor(
    public assetTypeId: string, // Unique identifier for the asset type
    public registeredAt: number = Date.now(),
    public registrar: number, // Entity ID of who registered this asset type
    public totalSupply: number = 0,
    public maxSupply?: number, // Optional max supply limit
    public decimals: number = 18 // Number of decimal places for this asset type
  ) {}

  toString(): string {
    return `AssetRegistry("${this.assetTypeId}", supply: ${this.totalSupply}/${this.maxSupply || '∞'}, decimals: ${this.decimals})`;
  }
}

/**
 * Asset balance component for fungible assets
 */
export class AssetBalance {
  constructor(
    public ownerEntityId: number, // Entity ID of the balance owner
    public assetTypeId: string,
    public amount: number = 0
  ) {}

  /**
   * Add to balance
   */
  add(amount: number): void {
    this.amount += amount;
  }

  /**
   * Subtract from balance (with safety check)
   */
  subtract(amount: number): boolean {
    if (this.amount >= amount) {
      this.amount -= amount;
      return true;
    }
    return false;
  }

  /**
   * Check if balance is sufficient
   */
  hasSufficient(amount: number): boolean {
    return this.amount >= amount;
  }

  toString(): string {
    return `AssetBalance(owner: ${this.ownerEntityId}, "${this.assetTypeId}", ${this.amount})`;
  }
}

/**
 * Asset transfer pending component - for tracking ongoing transfers
 */
export class AssetTransferPending {
  constructor(
    public fromEntityId: number,
    public toEntityId: number,
    public assetTypeId: string,
    public amount: number,
    public transferId: string = `transfer_${Date.now()}_${Math.random()}`,
    public initiatedAt: number = Date.now(),
    public expiresAt?: number
  ) {}

  isExpired(): boolean {
    return this.expiresAt ? Date.now() > this.expiresAt : false;
  }

  toString(): string {
    return `AssetTransferPending(${this.fromEntityId} -> ${this.toEntityId}, ${this.amount} ${this.assetTypeId})`;
  }
}

/**
 * Asset allowance component - for approved spending by other entities
 */
export class AssetAllowance {
  constructor(
    public ownerEntityId: number,
    public spenderEntityId: number,
    public assetTypeId: string,
    public allowedAmount: number,
    public grantedAt: number = Date.now()
  ) {}

  /**
   * Use allowance (decrease by amount)
   */
  use(amount: number): boolean {
    if (this.allowedAmount >= amount) {
      this.allowedAmount -= amount;
      return true;
    }
    return false;
  }

  toString(): string {
    return `AssetAllowance(owner: ${this.ownerEntityId}, spender: ${this.spenderEntityId}, ${this.allowedAmount} ${this.assetTypeId})`;
  }
}

// Register all asset component types
export const AssetMetadataType = componentRegistry.register('AssetMetadata', AssetMetadata);
export const AssetOwnershipType = componentRegistry.register('AssetOwnership', AssetOwnership);
export const AssetRegistryType = componentRegistry.register('AssetRegistry', AssetRegistry);
export const AssetBalanceType = componentRegistry.register('AssetBalance', AssetBalance);
export const AssetTransferPendingType = componentRegistry.register('AssetTransferPending', AssetTransferPending);
export const AssetAllowanceType = componentRegistry.register('AssetAllowance', AssetAllowance);

// Export component types for easy access
export const AssetComponentTypes = {
  AssetMetadata: AssetMetadataType,
  AssetOwnership: AssetOwnershipType,
  AssetRegistry: AssetRegistryType,
  AssetBalance: AssetBalanceType,
  AssetTransferPending: AssetTransferPendingType,
  AssetAllowance: AssetAllowanceType
}; 