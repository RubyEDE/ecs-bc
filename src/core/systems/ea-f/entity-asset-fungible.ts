import { BaseSystem } from '../../system';
import { World } from '../../world';
import { Entity } from '../../entity';
import {
  AssetMetadata,
  AssetBalance,
  AssetRegistry,
  AssetTransferPending,
  AssetAllowance,
  AssetComponentTypes
} from '../ea/components';

/**
 * Event interfaces for asset operations
 */
export interface AssetTransferEvent {
  from: number;
  to: number;
  assetTypeId: string;
  amount: number;
  transferId: string;
}

export interface AssetMintEvent {
  to: number;
  assetTypeId: string;
  amount: number;
}

export interface AssetBurnEvent {
  from: number;
  assetTypeId: string;
  amount: number;
}

export interface AssetApprovalEvent {
  owner: number;
  spender: number;
  assetTypeId: string;
  amount: number;
}

/**
 * Fungible Asset System - Manages fungible token operations
 */
export class EntityAssetFungibleSystem extends BaseSystem {
  private events: {
    transfers: AssetTransferEvent[];
    mints: AssetMintEvent[];
    burns: AssetBurnEvent[];
    approvals: AssetApprovalEvent[];
  } = {
    transfers: [],
    mints: [],
    burns: [],
    approvals: []
  };

  constructor() {
    super('EntityAssetFungibleSystem', [
      AssetComponentTypes.AssetTransferPending
    ]);
  }

  execute(world: World, deltaTime: number): void {
    // Process pending transfers
    this.processPendingTransfers(world);
    
    // Clean up expired transfers
    this.cleanupExpiredTransfers(world);
  }

  /**
   * Create a new fungible asset type
   */
  createAssetType(
    world: World,
    assetTypeId: string,
    metadata: {
      name: string;
      symbol: string;
      description?: string;
      imageUrl?: string;
      decimals?: number;
    },
    registrarEntityId: number,
    maxSupply?: number
  ): Entity {
    // Check if asset type already exists
    const existingRegistry = this.findAssetRegistry(world, assetTypeId);
    if (existingRegistry) {
      throw new Error(`Asset type '${assetTypeId}' already exists`);
    }

    // Create the asset type entity
    const assetTypeEntity = world.createEntity();

    // Add metadata component (without decimals)
    const assetMetadata = new AssetMetadata(
      metadata.name,
      metadata.symbol,
      metadata.description || '',
      metadata.imageUrl || '',
      {} // Remove decimals from metadata attributes
    );
    world.addComponent(assetTypeEntity, AssetComponentTypes.AssetMetadata, assetMetadata);

    // Add registry component (with decimals)
    const assetRegistry = new AssetRegistry(
      assetTypeId,
      Date.now(),
      registrarEntityId,
      0,
      maxSupply,
      metadata.decimals || 18 // Store decimals here
    );
    world.addComponent(assetTypeEntity, AssetComponentTypes.AssetRegistry, assetRegistry);

    return assetTypeEntity;
  }

  /**
   * Mint new tokens to an entity
   */
  mint(
    world: World,
    assetTypeId: string,
    toEntityId: number,
    amount: number,
    minterEntityId: number
  ): boolean {
    const assetRegistry = this.findAssetRegistry(world, assetTypeId);
    if (!assetRegistry) {
      throw new Error(`Asset type '${assetTypeId}' not found`);
    }

    // Check max supply limit
    if (assetRegistry.maxSupply && assetRegistry.totalSupply + amount > assetRegistry.maxSupply) {
      throw new Error(`Minting would exceed max supply of ${assetRegistry.maxSupply}`);
    }

    // Update total supply
    assetRegistry.totalSupply += amount;

    // Find or create balance for recipient
    let balance = this.findAssetBalance(world, toEntityId, assetTypeId);
    if (!balance) {
      // Create new balance entity for this user-asset pair
      const balanceEntity = world.createEntity();
      balance = new AssetBalance(toEntityId, assetTypeId, 0);
      world.addComponent(balanceEntity, AssetComponentTypes.AssetBalance, balance);
    }

    // Add to balance
    balance.add(amount);

    // Emit mint event
    this.events.mints.push({
      to: toEntityId,
      assetTypeId,
      amount
    });

    return true;
  }

  /**
   * Burn tokens from an entity
   */
  burn(
    world: World,
    assetTypeId: string,
    fromEntityId: number,
    amount: number
  ): boolean {
    const assetRegistry = this.findAssetRegistry(world, assetTypeId);
    if (!assetRegistry) {
      throw new Error(`Asset type '${assetTypeId}' not found`);
    }

    const balance = this.findAssetBalance(world, fromEntityId, assetTypeId);
    if (!balance || !balance.hasSufficient(amount)) {
      throw new Error(`Insufficient balance for burning ${amount} of ${assetTypeId}`);
    }

    // Subtract from balance
    balance.subtract(amount);

    // Update total supply
    assetRegistry.totalSupply -= amount;

    // Emit burn event
    this.events.burns.push({
      from: fromEntityId,
      assetTypeId,
      amount
    });

    return true;
  }

  /**
   * Transfer tokens between entities (immediate)
   */
  transfer(
    world: World,
    assetTypeId: string,
    fromEntityId: number,
    toEntityId: number,
    amount: number
  ): boolean {
    const fromBalance = this.findAssetBalance(world, fromEntityId, assetTypeId);
    if (!fromBalance || !fromBalance.hasSufficient(amount)) {
      throw new Error(`Insufficient balance for transfer`);
    }

    // Subtract from sender
    fromBalance.subtract(amount);

    // Find or create balance for recipient
    let toBalance = this.findAssetBalance(world, toEntityId, assetTypeId);
    if (!toBalance) {
      const balanceEntity = world.createEntity();
      toBalance = new AssetBalance(toEntityId, assetTypeId, 0);
      world.addComponent(balanceEntity, AssetComponentTypes.AssetBalance, toBalance);
    }

    // Add to recipient
    toBalance.add(amount);

    // Emit transfer event
    this.events.transfers.push({
      from: fromEntityId,
      to: toEntityId,
      assetTypeId,
      amount,
      transferId: `transfer_${Date.now()}_${Math.random()}`
    });

    return true;
  }

  /**
   * Create a pending transfer (for two-phase transfers)
   */
  createPendingTransfer(
    world: World,
    assetTypeId: string,
    fromEntityId: number,
    toEntityId: number,
    amount: number,
    expirationMs?: number
  ): string {
    const fromBalance = this.findAssetBalance(world, fromEntityId, assetTypeId);
    if (!fromBalance || !fromBalance.hasSufficient(amount)) {
      throw new Error(`Insufficient balance for pending transfer`);
    }

    const transferEntity = world.createEntity();
    const expiresAt = expirationMs ? Date.now() + expirationMs : undefined;
    
    const pendingTransfer = new AssetTransferPending(
      fromEntityId,
      toEntityId,
      assetTypeId,
      amount,
      `transfer_${Date.now()}_${Math.random()}`,
      Date.now(),
      expiresAt
    );

    world.addComponent(transferEntity, AssetComponentTypes.AssetTransferPending, pendingTransfer);

    return pendingTransfer.transferId;
  }

  /**
   * Approve spending allowance
   */
  approve(
    world: World,
    assetTypeId: string,
    ownerEntityId: number,
    spenderEntityId: number,
    amount: number
  ): boolean {
    // Remove existing allowance if any
    const existingAllowance = this.findAssetAllowance(world, ownerEntityId, spenderEntityId, assetTypeId);
    if (existingAllowance) {
      // Update existing allowance
      existingAllowance.allowedAmount = amount;
      existingAllowance.grantedAt = Date.now();
    } else {
      // Create new allowance
      const allowanceEntity = world.createEntity();
      const allowance = new AssetAllowance(
        ownerEntityId,
        spenderEntityId,
        assetTypeId,
        amount
      );
      world.addComponent(allowanceEntity, AssetComponentTypes.AssetAllowance, allowance);
    }

    // Emit approval event
    this.events.approvals.push({
      owner: ownerEntityId,
      spender: spenderEntityId,
      assetTypeId,
      amount
    });

    return true;
  }

  /**
   * Transfer from allowance (spend allowed tokens)
   */
  transferFrom(
    world: World,
    assetTypeId: string,
    ownerEntityId: number,
    toEntityId: number,
    amount: number,
    spenderEntityId: number
  ): boolean {
    const allowance = this.findAssetAllowance(world, ownerEntityId, spenderEntityId, assetTypeId);
    if (!allowance || !allowance.use(amount)) {
      throw new Error(`Insufficient allowance for transferFrom`);
    }

    // Execute the transfer
    return this.transfer(world, assetTypeId, ownerEntityId, toEntityId, amount);
  }

  /**
   * Get balance of an entity for a specific asset type
   */
  getBalance(world: World, entityId: number, assetTypeId: string): number {
    const balance = this.findAssetBalance(world, entityId, assetTypeId);
    return balance ? balance.amount : 0;
  }

  /**
   * Get allowance amount
   */
  getAllowance(
    world: World,
    ownerEntityId: number,
    spenderEntityId: number,
    assetTypeId: string
  ): number {
    const allowance = this.findAssetAllowance(world, ownerEntityId, spenderEntityId, assetTypeId);
    return allowance ? allowance.allowedAmount : 0;
  }

  /**
   * Get asset metadata
   */
  getAssetMetadata(world: World, assetTypeId: string): AssetMetadata | undefined {
    const registryQuery = world.query(AssetComponentTypes.AssetRegistry, AssetComponentTypes.AssetMetadata);
    
    for (const [entity, registry, metadata] of registryQuery.iter()) {
      if (registry.assetTypeId === assetTypeId) {
        return metadata;
      }
    }
    
    return undefined;
  }

  /**
   * Get total supply of an asset type
   */
  getTotalSupply(world: World, assetTypeId: string): number {
    const registry = this.findAssetRegistry(world, assetTypeId);
    return registry ? registry.totalSupply : 0;
  }

  /**
   * Get asset decimals from registry
   */
  getAssetDecimals(world: World, assetTypeId: string): number {
    const registry = this.findAssetRegistry(world, assetTypeId);
    return registry ? registry.decimals : 18;
  }

  /**
   * Get formatted balance with proper decimals
   */
  getFormattedBalance(world: World, entityId: number, assetTypeId: string): string {
    const balance = this.getBalance(world, entityId, assetTypeId);
    const decimals = this.getAssetDecimals(world, assetTypeId);
    return (balance / Math.pow(10, decimals)).toFixed(decimals);
  }

  /**
   * Get all events since last call (and clear them)
   */
  getAndClearEvents() {
    const events = { ...this.events };
    this.events = { transfers: [], mints: [], burns: [], approvals: [] };
    return events;
  }

  // Private helper methods

  private processPendingTransfers(world: World): void {
    const pendingQuery = world.query(AssetComponentTypes.AssetTransferPending);
    const transfersToComplete: Entity[] = [];

    for (const [entity, transfer] of pendingQuery.iter()) {
      if (!transfer.isExpired()) {
        // Execute the transfer
        try {
          this.transfer(
            world,
            transfer.assetTypeId,
            transfer.fromEntityId,
            transfer.toEntityId,
            transfer.amount
          );
          transfersToComplete.push(entity);
        } catch (error) {
          console.error('Failed to process pending transfer:', error);
          transfersToComplete.push(entity); // Remove failed transfer
        }
      }
    }

    // Remove completed transfers
    for (const entity of transfersToComplete) {
      world.destroyEntity(entity);
    }
  }

  private cleanupExpiredTransfers(world: World): void {
    const pendingQuery = world.query(AssetComponentTypes.AssetTransferPending);
    const expiredTransfers: Entity[] = [];

    for (const [entity, transfer] of pendingQuery.iter()) {
      if (transfer.isExpired()) {
        expiredTransfers.push(entity);
      }
    }

    // Remove expired transfers
    for (const entity of expiredTransfers) {
      world.destroyEntity(entity);
    }
  }

  private findAssetRegistry(world: World, assetTypeId: string): AssetRegistry | undefined {
    const registryQuery = world.query(AssetComponentTypes.AssetRegistry);
    
    for (const [entity, registry] of registryQuery.iter()) {
      if (registry.assetTypeId === assetTypeId) {
        return registry;
      }
    }
    
    return undefined;
  }

  private findAssetBalance(world: World, entityId: number, assetTypeId: string): AssetBalance | undefined {
    const balanceQuery = world.query(AssetComponentTypes.AssetBalance);
    
    for (const [entity, balance] of balanceQuery.iter()) {
      if (balance.ownerEntityId === entityId && balance.assetTypeId === assetTypeId) {
        return balance;
      }
    }
    
    return undefined;
  }

  private findAssetAllowance(
    world: World,
    ownerEntityId: number,
    spenderEntityId: number,
    assetTypeId: string
  ): AssetAllowance | undefined {
    const allowanceQuery = world.query(AssetComponentTypes.AssetAllowance);
    
    for (const [entity, allowance] of allowanceQuery.iter()) {
      if (
        allowance.ownerEntityId === ownerEntityId &&
        allowance.spenderEntityId === spenderEntityId &&
        allowance.assetTypeId === assetTypeId
      ) {
        return allowance;
      }
    }
    
    return undefined;
  }
} 