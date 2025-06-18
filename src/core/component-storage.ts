/**
 * Generic component array interface for Structure of Arrays (SoA) storage
 */
export interface ComponentArray<T = any> {
  readonly length: number;
  get(index: number): T;
  set(index: number, value: T): void;
  push(value: T): number;
  swapRemove(index: number): T;
  pop(): T | undefined;
  clear(): void;
  resize(newCapacity: number): void;
  getCapacity(): number;
}

/**
 * Generic component array implementation using regular JavaScript arrays
 */
export class GenericComponentArray<T> implements ComponentArray<T> {
  private data: T[] = [];
  private capacity: number;
  private _length = 0;
  
  constructor(initialCapacity = 1024) {
    this.capacity = initialCapacity;
    this.data = new Array(initialCapacity);
  }
  
  get length(): number {
    return this._length;
  }
  
  get(index: number): T {
    if (index < 0 || index >= this._length) {
      throw new Error(`Index ${index} out of bounds [0, ${this._length})`);
    }
    return this.data[index];
  }
  
  set(index: number, value: T): void {
    if (index < 0 || index >= this._length) {
      throw new Error(`Index ${index} out of bounds [0, ${this._length})`);
    }
    this.data[index] = value;
  }
  
  push(value: T): number {
    if (this._length >= this.data.length) {
      this.resize(this.data.length * 2);
    }
    
    this.data[this._length] = value;
    return ++this._length;
  }
  
  swapRemove(index: number): T {
    if (index < 0 || index >= this._length) {
      throw new Error(`Index ${index} out of bounds [0, ${this._length})`);
    }
    
    const removed = this.data[index];
    const lastIndex = this._length - 1;
    
    if (index !== lastIndex) {
      this.data[index] = this.data[lastIndex];
    }
    
    this._length--;
    return removed;
  }
  
  pop(): T | undefined {
    if (this._length === 0) {
      return undefined;
    }
    
    return this.data[--this._length];
  }
  
  clear(): void {
    this._length = 0;
  }
  
  resize(newCapacity: number): void {
    if (newCapacity <= this.data.length) {
      return;
    }
    
    const newData = new Array<T>(newCapacity);
    for (let i = 0; i < this._length; i++) {
      newData[i] = this.data[i];
    }
    this.data = newData;
    this.capacity = newCapacity;
  }
  
  getCapacity(): number {
    return this.capacity;
  }
  
  /**
   * Get raw data array (for internal use)
   */
  getRawData(): T[] {
    return this.data;
  }
}

/**
 * Optimized component array for numeric values using typed arrays
 */
export class NumericComponentArray implements ComponentArray<number> {
  private data: Float64Array;
  private _length = 0;
  
  constructor(initialCapacity = 1024) {
    this.data = new Float64Array(initialCapacity);
  }
  
  get length(): number {
    return this._length;
  }
  
  get(index: number): number {
    if (index < 0 || index >= this._length) {
      throw new Error(`Index ${index} out of bounds [0, ${this._length})`);
    }
    return this.data[index];
  }
  
  set(index: number, value: number): void {
    if (index < 0 || index >= this._length) {
      throw new Error(`Index ${index} out of bounds [0, ${this._length})`);
    }
    this.data[index] = value;
  }
  
  push(value: number): number {
    if (this._length >= this.data.length) {
      this.resize(this.data.length * 2);
    }
    
    this.data[this._length] = value;
    return ++this._length;
  }
  
  swapRemove(index: number): number {
    if (index < 0 || index >= this._length) {
      throw new Error(`Index ${index} out of bounds [0, ${this._length})`);
    }
    
    const removed = this.data[index];
    const lastIndex = this._length - 1;
    
    if (index !== lastIndex) {
      this.data[index] = this.data[lastIndex];
    }
    
    this._length--;
    return removed;
  }
  
  pop(): number | undefined {
    if (this._length === 0) {
      return undefined;
    }
    
    return this.data[--this._length];
  }
  
  clear(): void {
    this._length = 0;
  }
  
  resize(newCapacity: number): void {
    if (newCapacity <= this.data.length) {
      return;
    }
    
    const newData = new Float64Array(newCapacity);
    newData.set(this.data.subarray(0, this._length));
    this.data = newData;
  }
  
  getCapacity(): number {
    return this.data.length;
  }
  
  /**
   * Get raw typed array (for internal use)
   */
  getRawData(): Float64Array {
    return this.data;
  }
}

/**
 * Factory for creating appropriate component arrays based on component type
 */
export class ComponentArrayFactory {
  static create<T>(componentType: new (...args: any[]) => T, initialCapacity = 1024): ComponentArray<T> {
    // Check if this is a numeric type that can benefit from typed arrays
    if (ComponentArrayFactory.isNumericType(componentType)) {
      return new NumericComponentArray(initialCapacity) as unknown as ComponentArray<T>;
    }
    
    // Use generic array for complex objects
    return new GenericComponentArray<T>(initialCapacity);
  }
  
  private static isNumericType(componentType: new (...args: any[]) => any): boolean {
    // Simple heuristic: if the constructor returns a number, use typed array
    // In a real implementation, you might have a registry of numeric types
    try {
      const instance = new componentType();
      return typeof instance === 'number';
    } catch {
      return false;
    }
  }
}

/**
 * Component storage pool for reusing arrays and minimizing GC pressure
 */
export class ComponentArrayPool {
  private pools = new Map<string, ComponentArray<any>[]>();
  
  /**
   * Get a component array from the pool or create a new one
   */
  acquire<T>(componentTypeName: string, componentType: new (...args: any[]) => T): ComponentArray<T> {
    const pool = this.pools.get(componentTypeName);
    
    if (pool && pool.length > 0) {
      const array = pool.pop()!;
      array.clear();
      return array as ComponentArray<T>;
    }
    
    return ComponentArrayFactory.create(componentType);
  }
  
  /**
   * Return a component array to the pool for reuse
   */
  release<T>(componentTypeName: string, array: ComponentArray<T>): void {
    let pool = this.pools.get(componentTypeName);
    
    if (!pool) {
      pool = [];
      this.pools.set(componentTypeName, pool);
    }
    
    array.clear();
    pool.push(array);
  }
  
  /**
   * Clear all pools
   */
  clearPools(): void {
    this.pools.clear();
  }
  
  /**
   * Get pool statistics
   */
  getPoolStats(): Map<string, number> {
    const stats = new Map<string, number>();
    
    for (const [typeName, pool] of this.pools) {
      stats.set(typeName, pool.length);
    }
    
    return stats;
  }
} 