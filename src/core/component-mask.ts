/**
 * Component mask for efficient archetype matching using bigint
 * Supports up to 64 component types efficiently
 */
export class ComponentMask {
  private mask: bigint = 0n;
  
  /**
   * Set a component bit in the mask
   * @param componentId The component ID to set
   */
  set(componentId: number): void {
    if (componentId < 0 || componentId >= 64) {
      throw new Error(`Component ID ${componentId} is out of range (0-63)`);
    }
    this.mask |= 1n << BigInt(componentId);
  }
  
  /**
   * Check if a component bit is set
   * @param componentId The component ID to check
   * @returns True if the component is in the mask
   */
  has(componentId: number): boolean {
    if (componentId < 0 || componentId >= 64) {
      return false;
    }
    return (this.mask & (1n << BigInt(componentId))) !== 0n;
  }
  
  /**
   * Clear a component bit in the mask
   * @param componentId The component ID to clear
   */
  clearComponent(componentId: number): void {
    if (componentId < 0 || componentId >= 64) {
      return;
    }
    this.mask &= ~(1n << BigInt(componentId));
  }
  
  /**
   * Check if this mask equals another mask
   * @param other The other mask to compare
   * @returns True if masks are equal
   */
  equals(other: ComponentMask): boolean {
    return this.mask === other.mask;
  }
  
  /**
   * Check if this mask contains all components in another mask
   * @param other The other mask to check
   * @returns True if this mask contains all components in other
   */
  contains(other: ComponentMask): boolean {
    return (this.mask & other.mask) === other.mask;
  }
  
  /**
   * Create a new mask with the intersection of this and another mask
   * @param other The other mask
   * @returns New mask with intersection
   */
  intersect(other: ComponentMask): ComponentMask {
    const result = new ComponentMask();
    result.mask = this.mask & other.mask;
    return result;
  }
  
  /**
   * Create a new mask with the union of this and another mask
   * @param other The other mask
   * @returns New mask with union
   */
  union(other: ComponentMask): ComponentMask {
    const result = new ComponentMask();
    result.mask = this.mask | other.mask;
    return result;
  }
  
  /**
   * Get the raw mask value
   * @returns The bigint mask value
   */
  getMask(): bigint {
    return this.mask;
  }
  
  /**
   * Set the raw mask value
   * @param mask The bigint mask value
   */
  setMask(mask: bigint): void {
    this.mask = mask;
  }
  
  /**
   * Get count of set bits in the mask
   * @returns Number of components in the mask
   */
  getComponentCount(): number {
    let count = 0;
    let mask = this.mask;
    while (mask !== 0n) {
      if ((mask & 1n) === 1n) {
        count++;
      }
      mask >>= 1n;
    }
    return count;
  }
  
  /**
   * Get array of component IDs in the mask
   * @returns Array of component IDs
   */
  getComponentIds(): number[] {
    const ids: number[] = [];
    for (let i = 0; i < 64; i++) {
      if (this.has(i)) {
        ids.push(i);
      }
    }
    return ids;
  }
  
  /**
   * Create a copy of this mask
   * @returns New mask with same components
   */
  clone(): ComponentMask {
    const result = new ComponentMask();
    result.mask = this.mask;
    return result;
  }
  
  /**
   * Clear all components from the mask
   */
  clearAll(): void {
    this.mask = 0n;
  }
  
  /**
   * Check if the mask is empty
   * @returns True if no components are set
   */
  isEmpty(): boolean {
    return this.mask === 0n;
  }
  
  /**
   * Convert mask to string representation
   * @returns String representation of the mask
   */
  toString(): string {
    return this.mask.toString(2).padStart(64, '0');
  }
  
  /**
   * Create a mask from an array of component IDs
   * @param componentIds Array of component IDs
   * @returns New mask with specified components
   */
  static fromComponentIds(componentIds: number[]): ComponentMask {
    const mask = new ComponentMask();
    for (const id of componentIds) {
      mask.set(id);
    }
    return mask;
  }
  
  /**
   * Create a mask from a bigint value
   * @param mask The bigint mask value
   * @returns New mask with specified value
   */
  static fromMask(mask: bigint): ComponentMask {
    const result = new ComponentMask();
    result.mask = mask;
    return result;
  }
} 