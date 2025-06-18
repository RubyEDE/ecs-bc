import { System } from '../system';
import { ComponentType } from '../component';
import { World } from '../world';
import { SystemContext } from './system-context';
import { GasTracker, GasConfig, DEFAULT_GAS_CONFIG } from './gas-tracker';

/**
 * User-defined system definition interface
 */
export interface UserSystemDefinition {
  name: string;
  required: ComponentType[];
  execute: (ctx: SystemContext, deltaTime: number) => void;
  init?: (ctx: SystemContext) => void;
  cleanup?: (ctx: SystemContext) => void;
  gasConfig?: Partial<GasConfig>;
}

/**
 * User-defined system implementation with security and gas tracking
 */
export class UserSystem implements System {
  readonly name: string;
  readonly id: number;
  readonly componentTypes: ComponentType[];
  
  private readonly definition: UserSystemDefinition;
  private readonly gasConfig: GasConfig;
  private static nextId = 1000; // Start user systems at 1000 to avoid conflicts

  constructor(definition: UserSystemDefinition) {
    this.name = definition.name;
    this.id = UserSystem.nextId++;
    this.componentTypes = definition.required;
    this.definition = definition;
    
    // Merge gas config with defaults - use DEFAULT_GAS_CONFIG for complete config
    this.gasConfig = {
      maxGas: definition.gasConfig?.maxGas ?? DEFAULT_GAS_CONFIG.maxGas,
      gasCosts: {
        ...DEFAULT_GAS_CONFIG.gasCosts,
        ...definition.gasConfig?.gasCosts,
      },
    };
  }

  /**
   * Execute the user-defined system with gas tracking and security
   */
  execute(world: World, deltaTime: number): void {
    const gasTracker = new GasTracker(this.gasConfig);
    const context = new SystemContext(world, gasTracker, this.componentTypes, this.name);

    try {
      this.definition.execute(context, deltaTime);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`System '${this.name}' execution failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Initialize the user-defined system
   */
  init(world: World): void {
    if (!this.definition.init) return;

    const gasTracker = new GasTracker(this.gasConfig);
    const context = new SystemContext(world, gasTracker, this.componentTypes, this.name);

    try {
      this.definition.init(context);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`System '${this.name}' initialization failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Cleanup the user-defined system
   */
  cleanup(world: World): void {
    if (!this.definition.cleanup) return;

    const gasTracker = new GasTracker(this.gasConfig);
    const context = new SystemContext(world, gasTracker, this.componentTypes, this.name);

    try {
      this.definition.cleanup(context);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`System '${this.name}' cleanup failed: ${error.message}`);
      }
      throw error;
    }
  }
}

/**
 * DSL function for defining user systems
 * @param name System name
 * @param definition System definition
 * @returns UserSystem instance
 */
export function defineSystem(
  name: string,
  definition: Omit<UserSystemDefinition, 'name'>
): UserSystem {
  return new UserSystem({
    name,
    ...definition,
  });
} 