import { World } from '../../world';
import { Entity } from '../../entity';
import { EntityAssetFungibleSystem } from './entity-asset-fungible';
import { AssetMetadata, AssetComponentTypes } from '../ea/components';

/**
 * Asset Manager - High-level utility for asset operations
 */
export class AssetManager {
  constructor(private assetSystem: EntityAssetFungibleSystem) {}

  /**
   * Create a standard ERC-20 like token
   */
  createStandardToken(
    world: World,
    config: {
      symbol: string;
      name: string;
      decimals?: number;
      initialSupply?: number;
      maxSupply?: number;
      description?: string;
    },
    creatorEntityId: number,
    initialHolderEntityId?: number
  ): Entity {
    const tokenEntity = this.assetSystem.createAssetType(
      world,
      config.symbol,
      {
        name: config.name,
        symbol: config.symbol,
        description: config.description || `${config.name} Token`,
        decimals: config.decimals || 18
      },
      creatorEntityId,
      config.maxSupply
    );

    // Mint initial supply if specified
    if (config.initialSupply && config.initialSupply > 0) {
      const recipient = initialHolderEntityId || creatorEntityId;
      this.assetSystem.mint(world, config.symbol, recipient, config.initialSupply, creatorEntityId);
    }

    return tokenEntity;
  }

  /**
   * Batch transfer multiple assets
   */
  batchTransfer(
    world: World,
    fromEntityId: number,
    transfers: Array<{
      assetTypeId: string;
      toEntityId: number;
      amount: number;
    }>
  ): { successful: number; failed: Array<{ index: number; error: string }> } {
    const results = { successful: 0, failed: [] as Array<{ index: number; error: string }> };

    transfers.forEach((transfer, index) => {
      try {
        this.assetSystem.transfer(
          world,
          transfer.assetTypeId,
          fromEntityId,
          transfer.toEntityId,
          transfer.amount
        );
        results.successful++;
      } catch (error: any) {
        results.failed.push({
          index,
          error: error.message || 'Unknown error'
        });
      }
    });

    return results;
  }

  /**
   * Get portfolio summary for an entity
   */
  getPortfolio(world: World, entityId: number): Array<{
    assetTypeId: string;
    balance: number;
    metadata?: AssetMetadata;
    totalSupply: number;
  }> {
    const portfolio: Array<{
      assetTypeId: string;
      balance: number;
      metadata?: AssetMetadata;
      totalSupply: number;
    }> = [];

    // Query all asset balances for this specific entity
    const balanceQuery = world.query(AssetComponentTypes.AssetBalance);
    
    for (const [entity, balance] of balanceQuery.iter()) {
      // Only include balances owned by the specified entity
      if (balance.ownerEntityId === entityId && balance.amount > 0) {
        const metadata = this.assetSystem.getAssetMetadata(world, balance.assetTypeId);
        const totalSupply = this.assetSystem.getTotalSupply(world, balance.assetTypeId);
        
        portfolio.push({
          assetTypeId: balance.assetTypeId,
          balance: balance.amount,
          metadata,
          totalSupply
        });
      }
    }

    return portfolio;
  }

  /**
   * Get all allowances granted by an entity
   */
  getAllowancesGranted(world: World, ownerEntityId: number): Array<{
    spenderEntityId: number;
    assetTypeId: string;
    allowedAmount: number;
    grantedAt: number;
  }> {
    const allowances: Array<{
      spenderEntityId: number;
      assetTypeId: string;
      allowedAmount: number;
      grantedAt: number;
    }> = [];

    const allowanceQuery = world.query(AssetComponentTypes.AssetAllowance);
    
    for (const [entity, allowance] of allowanceQuery.iter()) {
      if (allowance.ownerEntityId === ownerEntityId) {
        allowances.push({
          spenderEntityId: allowance.spenderEntityId,
          assetTypeId: allowance.assetTypeId,
          allowedAmount: allowance.allowedAmount,
          grantedAt: allowance.grantedAt
        });
      }
    }

    return allowances;
  }

  /**
   * Get all allowances granted to an entity (what they can spend)
   */
  getAllowancesReceived(world: World, spenderEntityId: number): Array<{
    ownerEntityId: number;
    assetTypeId: string;
    allowedAmount: number;
    grantedAt: number;
  }> {
    const allowances: Array<{
      ownerEntityId: number;
      assetTypeId: string;
      allowedAmount: number;
      grantedAt: number;
    }> = [];

    const allowanceQuery = world.query(AssetComponentTypes.AssetAllowance);
    
    for (const [entity, allowance] of allowanceQuery.iter()) {
      if (allowance.spenderEntityId === spenderEntityId) {
        allowances.push({
          ownerEntityId: allowance.ownerEntityId,
          assetTypeId: allowance.assetTypeId,
          allowedAmount: allowance.allowedAmount,
          grantedAt: allowance.grantedAt
        });
      }
    }

    return allowances;
  }

  /**
   * Get all registered asset types
   */
  getAllAssetTypes(world: World): Array<{
    assetTypeId: string;
    metadata: AssetMetadata;
    totalSupply: number;
    maxSupply?: number;
    registeredAt: number;
    registrar: number;
  }> {
    const assetTypes: Array<{
      assetTypeId: string;
      metadata: AssetMetadata;
      totalSupply: number;
      maxSupply?: number;
      registeredAt: number;
      registrar: number;
    }> = [];

    const registryQuery = world.query(AssetComponentTypes.AssetRegistry, AssetComponentTypes.AssetMetadata);
    
    for (const [entity, registry, metadata] of registryQuery.iter()) {
      assetTypes.push({
        assetTypeId: registry.assetTypeId,
        metadata,
        totalSupply: registry.totalSupply,
        maxSupply: registry.maxSupply,
        registeredAt: registry.registeredAt,
        registrar: registry.registrar
      });
    }

    return assetTypes;
  }

  /**
   * Distribute tokens evenly to multiple recipients
   */
  distributeTokens(
    world: World,
    assetTypeId: string,
    fromEntityId: number,
    recipients: number[],
    totalAmount: number
  ): boolean {
    if (recipients.length === 0) {
      return false;
    }

    const amountPerRecipient = Math.floor(totalAmount / recipients.length);
    const remainder = totalAmount % recipients.length;

    try {
      // Transfer equal amounts to all recipients
      for (const recipientId of recipients) {
        this.assetSystem.transfer(world, assetTypeId, fromEntityId, recipientId, amountPerRecipient);
      }

      // If there's a remainder, give it to the first recipient
      if (remainder > 0) {
        this.assetSystem.transfer(world, assetTypeId, fromEntityId, recipients[0], remainder);
      }

      return true;
    } catch (error) {
      console.error('Error in token distribution:', error);
      return false;
    }
  }

  /**
   * Swap tokens between two entities (atomic exchange)
   */
  swapTokens(
    world: World,
    entity1Id: number,
    asset1TypeId: string,
    amount1: number,
    entity2Id: number,
    asset2TypeId: string,
    amount2: number
  ): boolean {
    try {
      // Check both entities have sufficient balances
      const balance1 = this.assetSystem.getBalance(world, entity1Id, asset1TypeId);
      const balance2 = this.assetSystem.getBalance(world, entity2Id, asset2TypeId);

      if (balance1 < amount1 || balance2 < amount2) {
        throw new Error('Insufficient balance for swap');
      }

      // Perform the swap
      this.assetSystem.transfer(world, asset1TypeId, entity1Id, entity2Id, amount1);
      this.assetSystem.transfer(world, asset2TypeId, entity2Id, entity1Id, amount2);

      return true;
    } catch (error) {
      console.error('Error in token swap:', error);
      return false;
    }
  }

  /**
   * Create a vesting schedule (simplified version using pending transfers)
   */
  createVestingSchedule(
    world: World,
    assetTypeId: string,
    fromEntityId: number,
    toEntityId: number,
    totalAmount: number,
    vestingPeriods: number,
    periodDurationMs: number
  ): string[] {
    const transferIds: string[] = [];
    const amountPerPeriod = Math.floor(totalAmount / vestingPeriods);
    const remainder = totalAmount % vestingPeriods;

    for (let i = 0; i < vestingPeriods; i++) {
      const amount = i === vestingPeriods - 1 ? amountPerPeriod + remainder : amountPerPeriod;
      const delayMs = (i + 1) * periodDurationMs;

      const transferId = this.assetSystem.createPendingTransfer(
        world,
        assetTypeId,
        fromEntityId,
        toEntityId,
        amount,
        delayMs
      );

      transferIds.push(transferId);
    }

    return transferIds;
  }
} 