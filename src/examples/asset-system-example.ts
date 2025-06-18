import { World } from '../core/world';
import { SystemPriority } from '../core/system';
import { EntityAssetFungibleSystem } from '../core/systems/ea-f';
import { AssetComponentTypes } from '../core/systems/ea';

/**
 * Comprehensive example demonstrating the Entity Asset Fungible System
 */
export function runAssetSystemExample() {
  console.log('=== Entity Asset Fungible System Example ===');
  
  // Create world and asset system
  const world = new World();
  const assetSystem = new EntityAssetFungibleSystem();
  
  // Add the system to the world
  world.addSystem(assetSystem, SystemPriority.NORMAL);
  
  // Initialize systems
  world.initializeSystems();
  
  try {
    // Create some entities to represent users/accounts
    const admin = world.createEntity();
    const alice = world.createEntity();
    const bob = world.createEntity();
    const charlie = world.createEntity();
    
    console.log(`Created entities - Admin: ${admin.id}, Alice: ${alice.id}, Bob: ${bob.id}, Charlie: ${charlie.id}`);
    
    // 1. Create a new fungible asset type (like a token)
    console.log('\n1. Creating asset types...');
    
    const goldTokenEntity = assetSystem.createAssetType(
      world,
      'GOLD',
      {
        name: 'Gold Token',
        symbol: 'GOLD',
        description: 'A precious metal token',
        decimals: 18
      },
      admin.id,
      1000000 // Max supply of 1M tokens
    );
    
    const silverTokenEntity = assetSystem.createAssetType(
      world,
      'SILVER',
      {
        name: 'Silver Token',
        symbol: 'SILVER',
        description: 'A silver token',
        decimals: 8
      },
      admin.id
      // No max supply limit
    );
    
    console.log(`Created GOLD token (entity ${goldTokenEntity.id}) and SILVER token (entity ${silverTokenEntity.id})`);
    
    // 2. Mint tokens to users
    console.log('\n2. Minting tokens...');
    
    assetSystem.mint(world, 'GOLD', alice.id, 1000, admin.id);
    assetSystem.mint(world, 'GOLD', bob.id, 500, admin.id);
    assetSystem.mint(world, 'SILVER', alice.id, 10000, admin.id);
    assetSystem.mint(world, 'SILVER', charlie.id, 5000, admin.id);
    
    console.log('Minted:');
    console.log(`  Alice: 1000 GOLD, 10000 SILVER`);
    console.log(`  Bob: 500 GOLD`);
    console.log(`  Charlie: 5000 SILVER`);
    
    // 3. Check balances
    console.log('\n3. Checking balances...');
    
    const aliceGold = assetSystem.getBalance(world, alice.id, 'GOLD');
    const aliceSilver = assetSystem.getBalance(world, alice.id, 'SILVER');
    const bobGold = assetSystem.getBalance(world, bob.id, 'GOLD');
    const charlieSilver = assetSystem.getBalance(world, charlie.id, 'SILVER');
    
    console.log(`Alice - GOLD: ${aliceGold}, SILVER: ${aliceSilver}`);
    console.log(`Bob - GOLD: ${bobGold}`);
    console.log(`Charlie - SILVER: ${charlieSilver}`);
    
    // 4. Direct transfers
    console.log('\n4. Performing transfers...');
    
    assetSystem.transfer(world, 'GOLD', alice.id, bob.id, 200);
    assetSystem.transfer(world, 'SILVER', alice.id, charlie.id, 1000);
    
    console.log('Transferred:');
    console.log(`  Alice -> Bob: 200 GOLD`);
    console.log(`  Alice -> Charlie: 1000 SILVER`);
    
    // Check balances after transfers
    console.log('\nBalances after transfers:');
    console.log(`Alice - GOLD: ${assetSystem.getBalance(world, alice.id, 'GOLD')}, SILVER: ${assetSystem.getBalance(world, alice.id, 'SILVER')}`);
    console.log(`Bob - GOLD: ${assetSystem.getBalance(world, bob.id, 'GOLD')}`);
    console.log(`Charlie - SILVER: ${assetSystem.getBalance(world, charlie.id, 'SILVER')}`);
    
    // 5. Approve and transferFrom (allowance system)
    console.log('\n5. Testing allowance system...');
    
    // Alice approves Bob to spend 100 GOLD on her behalf
    assetSystem.approve(world, 'GOLD', alice.id, bob.id, 100);
    console.log(`Alice approved Bob to spend 100 GOLD`);
    
    const allowance = assetSystem.getAllowance(world, alice.id, bob.id, 'GOLD');
    console.log(`Bob's allowance from Alice: ${allowance} GOLD`);
    
    // Bob transfers some of Alice's GOLD to Charlie using transferFrom
    assetSystem.transferFrom(world, 'GOLD', alice.id, charlie.id, 50, bob.id);
    console.log(`Bob transferred 50 GOLD from Alice to Charlie using allowance`);
    
    console.log('Balances after transferFrom:');
    console.log(`Alice - GOLD: ${assetSystem.getBalance(world, alice.id, 'GOLD')}`);
    console.log(`Charlie - GOLD: ${assetSystem.getBalance(world, charlie.id, 'GOLD')}`);
    console.log(`Bob's remaining allowance: ${assetSystem.getAllowance(world, alice.id, bob.id, 'GOLD')}`);
    
    // 6. Burn tokens
    console.log('\n6. Burning tokens...');
    
    const goldSupplyBefore = assetSystem.getTotalSupply(world, 'GOLD');
    console.log(`GOLD total supply before burn: ${goldSupplyBefore}`);
    
    assetSystem.burn(world, 'GOLD', bob.id, 100);
    console.log(`Burned 100 GOLD from Bob`);
    
    const goldSupplyAfter = assetSystem.getTotalSupply(world, 'GOLD');
    console.log(`GOLD total supply after burn: ${goldSupplyAfter}`);
    console.log(`Bob's GOLD balance after burn: ${assetSystem.getBalance(world, bob.id, 'GOLD')}`);
    
    // 7. Create pending transfer
    console.log('\n7. Testing pending transfers...');
    
    const transferId = assetSystem.createPendingTransfer(
      world,
      'SILVER',
      alice.id,
      bob.id,
      500,
      5000 // 5 second expiration
    );
    
    console.log(`Created pending transfer: ${transferId}`);
    console.log('Alice SILVER before pending transfer processing:', assetSystem.getBalance(world, alice.id, 'SILVER'));
    console.log('Bob SILVER before pending transfer processing:', assetSystem.getBalance(world, bob.id, 'SILVER'));
    
    // Run systems to process pending transfers
    world.runSystems(0.016);
    
    console.log('Alice SILVER after pending transfer processing:', assetSystem.getBalance(world, alice.id, 'SILVER'));
    console.log('Bob SILVER after pending transfer processing:', assetSystem.getBalance(world, bob.id, 'SILVER'));
    
    // 8. Get asset metadata
    console.log('\n8. Asset metadata...');
    
    const goldMetadata = assetSystem.getAssetMetadata(world, 'GOLD');
    const silverMetadata = assetSystem.getAssetMetadata(world, 'SILVER');
    
    console.log(`GOLD metadata:`, goldMetadata?.toString());
    console.log(`SILVER metadata:`, silverMetadata?.toString());
    
    // 9. Get and display events
    console.log('\n9. Asset events...');
    
    const events = assetSystem.getAndClearEvents();
    console.log(`Transfers: ${events.transfers.length}`);
    console.log(`Mints: ${events.mints.length}`);
    console.log(`Burns: ${events.burns.length}`);
    console.log(`Approvals: ${events.approvals.length}`);
    
    // Display some transfer events
    events.transfers.slice(0, 3).forEach((transfer, index) => {
      console.log(`  Transfer ${index + 1}: ${transfer.amount} ${transfer.assetTypeId} from ${transfer.from} to ${transfer.to}`);
    });
    
    // 10. Final balances and supply info
    console.log('\n10. Final summary...');
    
    console.log('Final balances:');
    console.log(`Alice - GOLD: ${assetSystem.getBalance(world, alice.id, 'GOLD')}, SILVER: ${assetSystem.getBalance(world, alice.id, 'SILVER')}`);
    console.log(`Bob - GOLD: ${assetSystem.getBalance(world, bob.id, 'GOLD')}, SILVER: ${assetSystem.getBalance(world, bob.id, 'SILVER')}`);
    console.log(`Charlie - GOLD: ${assetSystem.getBalance(world, charlie.id, 'GOLD')}, SILVER: ${assetSystem.getBalance(world, charlie.id, 'SILVER')}`);
    
    console.log('\nTotal supplies:');
    console.log(`GOLD: ${assetSystem.getTotalSupply(world, 'GOLD')}`);
    console.log(`SILVER: ${assetSystem.getTotalSupply(world, 'SILVER')}`);
    
    console.log('\n=== Example completed successfully! ===');
    
  } catch (error) {
    console.error('Error in asset system example:', error);
  } finally {
    // Clean up
    world.clear();
  }
}

// Helper function to demonstrate error handling
export function demonstrateAssetSystemErrorCases() {
  console.log('\n=== Asset System Error Handling Demo ===');
  
  const world = new World();
  const assetSystem = new EntityAssetFungibleSystem();
  world.addSystem(assetSystem);
  world.initializeSystems();
  
  const admin = world.createEntity();
  const user = world.createEntity();
  
  // Create an asset type
  assetSystem.createAssetType(world, 'TEST', { name: 'Test', symbol: 'TEST' }, admin.id, 1000);
  
  try {
    // 1. Try to create duplicate asset type
    assetSystem.createAssetType(world, 'TEST', { name: 'Test2', symbol: 'TEST2' }, admin.id);
  } catch (error: any) {
    console.log('✓ Correctly caught duplicate asset type creation:', error.message);
  }
  
  try {
    // 2. Try to transfer more than balance
    assetSystem.mint(world, 'TEST', user.id, 100, admin.id);
    assetSystem.transfer(world, 'TEST', user.id, admin.id, 200);
  } catch (error: any) {
    console.log('✓ Correctly caught insufficient balance:', error.message);
  }
  
  try {
    // 3. Try to mint beyond max supply
    assetSystem.mint(world, 'TEST', user.id, 1001, admin.id);
  } catch (error: any) {
    console.log('✓ Correctly caught max supply exceeded:', error.message);
  }
  
  try {
    // 4. Try to transfer non-existent asset
    assetSystem.transfer(world, 'NONEXISTENT', user.id, admin.id, 50);
  } catch (error: any) {
    console.log('✓ Correctly caught operation on non-existent asset:', error.message);
  }
  
  console.log('=== Error handling demo completed ===');
  
  world.clear();
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAssetSystemExample();
  demonstrateAssetSystemErrorCases();
} 