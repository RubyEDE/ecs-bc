/**
 * Component mask for efficient archetype matching
 * Supports unlimited component types for prototyping
 */
export class ComponentMask {
  private componentIds = new Set<number>();
  
  /**
   * Set a component bit in the mask
   * @param componentId The component ID to set
   */
  set(componentId: number): void {
    if (componentId < 0) {
      throw new Error(`Component ID ${componentId} must be non-negative`);
    }
    this.componentIds.add(componentId);
  }
  
  /**
   * Check if a component bit is set
   * @param componentId The component ID to check
   * @returns True if the component is in the mask
   */
  has(componentId: number): boolean {
    if (componentId < 0) {
      return false;
    }
    return this.componentIds.has(componentId);
  }
  
  /**
   * Clear a component bit in the mask
   * @param componentId The component ID to clear
   */
  clearComponent(componentId: number): void {
    if (componentId < 0) {
      return;
    }
    this.componentIds.delete(componentId);
  }
  
  /**
   * Check if this mask equals another mask
   * @param other The other mask to compare
   * @returns True if masks are equal
   */
  equals(other: ComponentMask): boolean {
    if (this.componentIds.size !== other.componentIds.size) {
      return false;
    }
    for (const id of this.componentIds) {
      if (!other.componentIds.has(id)) {
        return false;
      }
    }
    return true;
  }
  
  /**
   * Check if this mask contains all components in another mask
   * @param other The other mask to check
   * @returns True if this mask contains all components in other
   */
  contains(other: ComponentMask): boolean {
    for (const id of other.componentIds) {
      if (!this.componentIds.has(id)) {
        return false;
      }
    }
    return true;
  }
  
  /**
   * Create a new mask with the intersection of this and another mask
   * @param other The other mask
   * @returns New mask with intersection
   */
  intersect(other: ComponentMask): ComponentMask {
    const result = new ComponentMask();
    for (const id of this.componentIds) {
      if (other.componentIds.has(id)) {
        result.componentIds.add(id);
      }
    }
    return result;
  }
  
  /**
   * Create a new mask with the union of this and another mask
   * @param other The other mask
   * @returns New mask with union
   */
  union(other: ComponentMask): ComponentMask {
    const result = new ComponentMask();
    for (const id of this.componentIds) {
      result.componentIds.add(id);
    }
    for (const id of other.componentIds) {
      result.componentIds.add(id);
    }
    return result;
  }
  
  /**
   * Get the component IDs as a set
   * @returns Set of component IDs
   */
  getComponentIdSet(): Set<number> {
    return new Set(this.componentIds);
  }
  
  /**
   * Set the component IDs from a set
   * @param componentIds Set of component IDs
   */
  setComponentIds(componentIds: Set<number>): void {
    this.componentIds = new Set(componentIds);
  }
  
  /**
   * Get count of components in the mask
   * @returns Number of components in the mask
   */
  getComponentCount(): number {
    return this.componentIds.size;
  }
  
  /**
   * Get array of component IDs in the mask
   * @returns Array of component IDs (sorted)
   */
  getComponentIds(): number[] {
    return Array.from(this.componentIds).sort((a, b) => a - b);
  }
  
  /**
   * Create a copy of this mask
   * @returns New mask with same components
   */
  clone(): ComponentMask {
    const result = new ComponentMask();
    result.componentIds = new Set(this.componentIds);
    return result;
  }
  
  /**
   * Clear all components from the mask
   */
  clearAll(): void {
    this.componentIds.clear();
  }
  
  /**
   * Check if the mask is empty
   * @returns True if no components are set
   */
  isEmpty(): boolean {
    return this.componentIds.size === 0;
  }
  
  /**
   * Convert mask to string representation
   * @returns String representation of the mask
   */
  toString(): string {
    const ids = this.getComponentIds();
    return `ComponentMask{${ids.join(',')}}`;
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
   * Create a mask from a set of component IDs
   * @param componentIds Set of component IDs
   * @returns New mask with specified components
   */
  static fromComponentIdSet(componentIds: Set<number>): ComponentMask {
    const mask = new ComponentMask();
    mask.componentIds = new Set(componentIds);
    return mask;
  }

  // Legacy compatibility methods for bigint-based systems
  
  /**
   * Get a bigint representation for the first 64 components (legacy compatibility)
   * @returns Bigint mask for first 64 components
   * @deprecated Use getComponentIds() or getComponentIdSet() instead
   */
  getMask(): bigint {
    let mask = 0n;
    for (const id of this.componentIds) {
      if (id < 64) {
        mask |= 1n << BigInt(id);
      }
    }
    return mask;
  }
  
  /**
   * Set components from bigint value (legacy compatibility)
   * @param mask Bigint mask value
   * @deprecated Use setComponentIds() or set() instead
   */
  setMask(mask: bigint): void {
    this.componentIds.clear();
    for (let i = 0; i < 64; i++) {
      if ((mask & (1n << BigInt(i))) !== 0n) {
        this.componentIds.add(i);
      }
    }
  }
  
  /**
   * Create a mask from a bigint value (legacy compatibility)
   * @param mask The bigint mask value
   * @returns New mask with specified value
   * @deprecated Use fromComponentIds() or fromComponentIdSet() instead
   */
  static fromMask(mask: bigint): ComponentMask {
    const result = new ComponentMask();
    result.setMask(mask);
    return result;
  }
} 