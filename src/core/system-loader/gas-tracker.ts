/**
 * Gas tracking for limiting resource consumption in user-defined systems
 */
export interface GasConfig {
  maxGas: number;
  gasCosts: {
    entityQuery: number;
    componentAccess: number;
    componentUpdate: number;
    entityCreate: number;
    entityDestroy: number;
    iteration: number;
    // New gas costs for enhanced features
    defineComponent: number;
    addComponent: number;
    updateComponent: number;
    removeComponent: number;
    eventSubscribe: number;
    eventEmit: number;
    crossSystemCall: number;
  };
}

export const DEFAULT_GAS_CONFIG: GasConfig = {
  maxGas: 10000,
  gasCosts: {
    entityQuery: 10,
    componentAccess: 1,
    componentUpdate: 2,
    entityCreate: 5,
    entityDestroy: 3,
    iteration: 1,
    // New default costs
    defineComponent: 20,
    addComponent: 3,
    updateComponent: 2,
    removeComponent: 2,
    eventSubscribe: 5,
    eventEmit: 8,
    crossSystemCall: 15,
  }
};

export class GasTracker {
  private gasUsed = 0;
  private readonly config: GasConfig;

  constructor(config: GasConfig = DEFAULT_GAS_CONFIG) {
    this.config = config;
  }

  /**
   * Consume gas for an operation
   * @param operation Type of operation
   * @param amount Optional custom amount (overrides config)
   */
  consumeGas(operation: keyof GasConfig['gasCosts'], amount?: number): void {
    const cost = amount ?? this.config.gasCosts[operation];
    this.gasUsed += cost;
    
    if (this.gasUsed > this.config.maxGas) {
      throw new Error(`Gas limit exceeded: ${this.gasUsed}/${this.config.maxGas}`);
    }
  }

  /**
   * Get current gas usage
   */
  getGasUsed(): number {
    return this.gasUsed;
  }

  /**
   * Get remaining gas
   */
  getRemainingGas(): number {
    return Math.max(0, this.config.maxGas - this.gasUsed);
  }

  /**
   * Reset gas usage
   */
  reset(): void {
    this.gasUsed = 0;
  }

  /**
   * Check if gas limit would be exceeded by operation
   */
  canAfford(operation: keyof GasConfig['gasCosts'], amount?: number): boolean {
    const cost = amount ?? this.config.gasCosts[operation];
    return this.gasUsed + cost <= this.config.maxGas;
  }
} 