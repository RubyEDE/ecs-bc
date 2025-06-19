import { World } from '../src/core/world';
import { SystemContext } from '../src/core/system-loader/system-context';
import { GasTracker, DEFAULT_GAS_CONFIG } from '../src/core/system-loader/gas-tracker';
import { deploymentTracker, SystemId } from './deployment-tracker';
import { VM } from 'vm2';
import { componentRegistry } from '../src/core/component';
import { dynamicComponentRegistry } from '../src/core/system-loader/dynamic-component-registry';

/**
 * Function execution result
 */
export interface FunctionExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  gasUsed: number;
  executionTime: number;
}

/**
 * Executes individual functions from deployed systems
 */
export class FunctionExecutor {
  constructor(private world: World) {}

  /**
   * Execute a specific function from a deployed system
   */
  async executeFunction(systemId: SystemId, functionName: string, args: any = {}): Promise<FunctionExecutionResult> {
    const startTime = performance.now();
    
    try {
      // Get the deployed system
      const systems = this.world.getAllLoadedSystems();
      const system = systems.find((s: any) => s.id === systemId);
      
      if (!system) {
        throw new Error(`System with ID ${systemId} not found`);
      }

      // Get deployment info which contains the original source
      const deploymentInfo = deploymentTracker.getDeploymentInfo(systemId);
      if (!deploymentInfo) {
        throw new Error(`Deployment info for system ${systemId} not found`);
      }

      // Validate function exists
      const executable = deploymentInfo.executables.find(exec => exec.name === functionName);
      if (!executable) {
        throw new Error(`Function '${functionName}' not found in system '${system.name}'`);
      }

      // Get the original source from deployment info
      // Note: We'll need to modify deployment tracker to store the source code
      const originalSource = (deploymentInfo as any).originalSource;
      if (!originalSource) {
        throw new Error(`Original source code not available for system '${system.name}'`);
      }

      // Create execution context
      const gasTracker = new GasTracker(DEFAULT_GAS_CONFIG);
      const context = new SystemContext(this.world, gasTracker, system.componentTypes, system.name);

      // Create enhanced context with additional methods that user systems expect
      const enhancedContext = this.createEnhancedContext(context, systemId);

      // Execute the function using VM2
      const result = await this.executeInSandbox(originalSource, functionName, enhancedContext, args);

      const executionTime = performance.now() - startTime;

      return {
        success: true,
        result,
        gasUsed: gasTracker.getGasUsed(),
        executionTime
      };

    } catch (error) {
      const executionTime = performance.now() - startTime;
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        gasUsed: 0,
        executionTime
      };
    }
  }

  /**
   * Create enhanced context with additional methods for user systems
   */
  private createEnhancedContext(baseContext: SystemContext, systemId: SystemId): any {
    return {
      ...baseContext,
      
      // Additional methods that user systems might expect
      defineComponent: (name: string, schema: any) => {
        console.log(`[FunctionExecutor] defineComponent called for: ${name}`, schema);
        // Use the actual dynamic component registry
        try {
          const componentType = dynamicComponentRegistry.defineComponent(name, schema, systemId.toString());
          console.log(`[FunctionExecutor] Successfully registered component: ${name} with ID: ${componentType.id}`);
          return componentType;
        } catch (error) {
          console.error(`[FunctionExecutor] Failed to register component ${name}:`, error);
          throw error;
        }
      },
      
      createEntity: () => {
        // Create entity in the main world
        const entity = this.world.createEntity();
        console.log(`[FunctionExecutor] Created entity:`, entity.id);
        return entity;
      },
      
      addComponent: (entity: any, componentName: string, data: any) => {
        console.log(`[FunctionExecutor] Adding component ${componentName} to entity ${entity.id}:`, data);
        
        // Try to get component type from dynamic registry first
        let componentType = dynamicComponentRegistry.getComponentType(componentName, systemId.toString());
        
        // Fall back to static registry if not found
        if (!componentType) {
          componentType = componentRegistry.getType(componentName);
        }
        
        // If still not found, check if the component was defined in this system's deployment
        if (!componentType) {
          const deploymentInfo = deploymentTracker.getDeploymentInfo(systemId);
          if (deploymentInfo) {
            const componentDef = deploymentInfo.components.find(c => c.name === componentName);
            if (componentDef) {
              console.log(`[FunctionExecutor] Found component ${componentName} in deployment info, creating temporary component type`);
              
              // Create a temporary component type for this execution
              // This is a workaround to work within server constraints
              const tempComponentType = {
                id: componentDef.version + 50, // Use a higher ID to avoid conflicts
                name: componentName,
                constructor: class TempComponent {
                  constructor(compData: any = {}) {
                    Object.assign(this, compData);
                  }
                }
              };
              
              // Use this temporary component type
              this.world.addComponent(entity, tempComponentType as any, data);
              console.log(`[FunctionExecutor] Successfully added component ${componentName} to entity ${entity.id} using temp type`);
              return;
            }
          }
        }
        
        if (componentType) {
          // Use the main world to add the component
          this.world.addComponent(entity, componentType, data);
          console.log(`[FunctionExecutor] Successfully added component ${componentName} to entity ${entity.id}`);
        } else {
          console.warn(`[FunctionExecutor] Component type '${componentName}' not found in any registry or deployment info`);
          throw new Error(`Component type '${componentName}' not found`);
        }
      },
      
      getComponent: (entityId: any, componentName: string) => {
        // Handle both entity objects and entity IDs
        let entity: any;
        if (typeof entityId === 'number') {
          // Get the current generation for this entity ID
          const currentGeneration = this.world.getCurrentGeneration(entityId);
          if (currentGeneration === -1) {
            return undefined; // Entity ID is invalid
          }
          entity = { id: entityId, generation: currentGeneration };
        } else {
          entity = entityId;
        }
        
        // Try dynamic registry first
        let componentType = dynamicComponentRegistry.getComponentType(componentName, systemId.toString());
        
        // Fall back to static registry
        if (!componentType) {
          componentType = componentRegistry.getType(componentName);
        }
        
        // If still not found, check deployment info and create temp component type
        if (!componentType) {
          const deploymentInfo = deploymentTracker.getDeploymentInfo(systemId);
          if (deploymentInfo) {
            const componentDef = deploymentInfo.components.find(c => c.name === componentName);
            if (componentDef) {
              const tempComponentType = {
                id: componentDef.version + 50,
                name: componentName,
                constructor: class TempComponent {
                  constructor(compData: any = {}) {
                    Object.assign(this, compData);
                  }
                }
              };
              return this.world.getComponent(entity, tempComponentType as any);
            }
          }
        }
        
        if (componentType) {
          return this.world.getComponent(entity, componentType);
        }
        return undefined;
      },
      
      updateComponent: (entityId: any, componentName: string, data: any) => {
        // Handle both entity objects and entity IDs
        let entity: any;
        if (typeof entityId === 'number') {
          // Get the current generation for this entity ID
          const currentGeneration = this.world.getCurrentGeneration(entityId);
          if (currentGeneration === -1) {
            throw new Error(`Entity ID ${entityId} is invalid`);
          }
          entity = { id: entityId, generation: currentGeneration };
        } else {
          entity = entityId;
        }
        
        // Try dynamic registry first
        let componentType = dynamicComponentRegistry.getComponentType(componentName, systemId.toString());
        
        // Fall back to static registry
        if (!componentType) {
          componentType = componentRegistry.getType(componentName);
        }
        
        // If still not found, check deployment info and create temp component type
        if (!componentType) {
          const deploymentInfo = deploymentTracker.getDeploymentInfo(systemId);
          if (deploymentInfo) {
            const componentDef = deploymentInfo.components.find(c => c.name === componentName);
            if (componentDef) {
              const tempComponentType = {
                id: componentDef.version + 50,
                name: componentName,
                constructor: class TempComponent {
                  constructor(compData: any = {}) {
                    Object.assign(this, compData);
                  }
                }
              };
              this.world.addComponent(entity, tempComponentType as any, data);
              console.log(`[FunctionExecutor] Updated component ${componentName} on entity ${entity.id} using temp type`);
              return;
            }
          }
        }
        
        if (componentType) {
          // Adding component again will update it
          this.world.addComponent(entity, componentType, data);
          console.log(`[FunctionExecutor] Updated component ${componentName} on entity ${entity.id}`);
        } else {
          throw new Error(`Component type '${componentName}' not found`);
        }
      },
      
      getMySystemId: () => systemId,
      
      grantAccess: (entity: any, systemId: any, permissions: any) => {
        console.log(`[FunctionExecutor] grantAccess called:`, { entity, systemId, permissions });
        // Placeholder implementation
      },
      
      getOwnership: (entityId: any) => {
        console.log(`[FunctionExecutor] getOwnership called for entity:`, entityId);
        return systemId; // Simplified ownership
      },
      
      emit: (eventName: string, data: any) => {
        console.log(`[FunctionExecutor] Event emitted:`, { eventName, data });
        // Placeholder implementation
      },
      
      warn: (message: string) => {
        console.warn(`[System ${systemId}] ${message}`);
      },
      
      log: (...args: any[]) => {
        console.log(`[System ${systemId}]`, ...args);
      }
    };
  }

  /**
   * Execute function in secure sandbox
   */
  private async executeInSandbox(source: string, functionName: string, context: any, args: any): Promise<any> {
    // Create the execution code that will extract and call the specific function
    const executionCode = `
      ${source}
      
      // Find the system definition
      let systemDef = null;
      
      // Try to find system in different ways
      if (typeof defineSystem === 'function') {
        // Override defineSystem to capture the definition
        const originalDefineSystem = defineSystem;
        defineSystem = function(name, definition) {
          systemDef = definition;
          return originalDefineSystem(name, definition);
        };
        
        // Re-execute the source to capture the system
        ${source}
      }
      
      // Execute the specific function
      if (systemDef && systemDef.execute && systemDef.execute['${functionName}']) {
        const func = systemDef.execute['${functionName}'];
        const result = func(context, args);
        result;
      } else {
        throw new Error('Function ${functionName} not found in system definition');
      }
    `;

    // Create sandbox with necessary globals
    const sandbox = {
      context,
      args,
      console,
      Math,
      Object,
      Array,
      String,
      Number,
      Boolean,
      JSON,
      Error,
      defineSystem: (name: string, definition: any) => definition,
      getComponent: (name: string) => componentRegistry.getType(name),
    };

    const vm = new VM({
      timeout: 10000,
      sandbox
    });

    return vm.run(executionCode);
  }
}

// Global instance
let functionExecutor: FunctionExecutor | null = null;

/**
 * Initialize the function executor
 */
export function initializeFunctionExecutor(world: World): FunctionExecutor {
  if (!functionExecutor) {
    functionExecutor = new FunctionExecutor(world);
  }
  return functionExecutor;
}

/**
 * Get the function executor instance
 */
export function getFunctionExecutor(): FunctionExecutor | null {
  return functionExecutor;
} 