/**
 * Entity representation with generation counter for safe reuse
 */
export interface Entity {
  readonly id: number;
  readonly generation: number;
}

/**
 * Entity allocator with recycling and generation tracking
 * Provides deterministic entity allocation with safe reuse
 */
export class EntityAllocator {
  private freeList: number[] = [];
  private generations: number[] = [];
  private nextId = 0;
  
  /**
   * Allocate a new entity or reuse a freed one
   * @returns A new entity with unique ID and generation
   */
  allocate(): Entity {
    let id: number;
    
    if (this.freeList.length > 0) {
      // Reuse a freed entity ID
      id = this.freeList.pop()!;
      this.generations[id]++;
    } else {
      // Allocate a new entity ID
      id = this.nextId++;
      this.generations[id] = 0;
    }
    
    return {
      id,
      generation: this.generations[id]
    };
  }
  
  /**
   * Deallocate an entity, making its ID available for reuse
   * @param entity The entity to deallocate
   */
  deallocate(entity: Entity): void {
    if (!this.isAlive(entity)) {
      throw new Error(`Entity ${entity.id}:${entity.generation} is already dead`);
    }
    
    this.freeList.push(entity.id);
  }
  
  /**
   * Check if an entity is still alive (valid generation)
   * @param entity The entity to check
   * @returns True if the entity is alive
   */
  isAlive(entity: Entity): boolean {
    return entity.id < this.generations.length && 
           this.generations[entity.id] === entity.generation;
  }
  
  /**
   * Get the current generation for an entity ID
   * @param entityId The entity ID
   * @returns The current generation, or -1 if invalid
   */
  getCurrentGeneration(entityId: number): number {
    return entityId < this.generations.length ? this.generations[entityId] : -1;
  }
  
  /**
   * Get total number of allocated entities (including freed ones)
   * @returns Total entity count
   */
  getTotalAllocated(): number {
    return this.nextId;
  }
  
  /**
   * Get number of currently alive entities
   * @returns Alive entity count
   */
  getAliveCount(): number {
    return this.nextId - this.freeList.length;
  }
} 