import { VM } from 'vm2';
import * as fs from 'fs-extra';
import * as path from 'path';
import { UserSystem, UserSystemDefinition, defineSystem } from './user-system';
import { SecurityValidator, SecurityConfig, DEFAULT_SECURITY_CONFIG } from './security-validator';
import { ComponentType, componentRegistry } from '../component';
import { GasConfig } from './gas-tracker';
import { TypeScriptCompiler } from './typescript-compiler';

/**
 * System loader configuration
 */
export interface SystemLoaderConfig {
  security?: Partial<SecurityConfig>;
  defaultGasConfig?: Partial<GasConfig>;
  vmTimeout?: number;
  workingDirectory?: string;
}

/**
 * Result of loading a system
 */
export interface LoadResult {
  system: UserSystem;
  source: string;
  compiledJS: string;
  loadTime: number;
}

/**
 * SystemLoader for safely loading and executing user-defined TypeScript systems
 */
export class SystemLoader {
  private readonly securityValidator: SecurityValidator;
  private readonly config: SystemLoaderConfig;
  private readonly tsCompiler: TypeScriptCompiler;
  private readonly loadedSystems = new Map<string, LoadResult>();

  constructor(config: SystemLoaderConfig = {}) {
    this.config = {
      security: { ...DEFAULT_SECURITY_CONFIG, ...(config.security || {}) },
      defaultGasConfig: config.defaultGasConfig || {},
      vmTimeout: config.vmTimeout || 5000,
      workingDirectory: config.workingDirectory || process.cwd(),
    };

    this.securityValidator = new SecurityValidator(this.config.security as SecurityConfig);
    this.tsCompiler = new TypeScriptCompiler();
  }

  /**
   * Load a user-defined system from TypeScript source code
   * @param source TypeScript source code defining a system
   * @param filename Optional filename for better error messages
   * @param deploymentOptions Optional deployment configuration
   * @returns UserSystem instance with unique deployment ID
   */
  loadFromSource(
    source: string, 
    filename?: string,
    deploymentOptions?: { 
      uniqueId?: string;
      instanceSuffix?: string;
    }
  ): UserSystem {
    const startTime = performance.now();

    try {
      // 1. Validate TypeScript syntax
      const syntaxErrors = this.tsCompiler.validateSyntax(source);
      if (syntaxErrors.length > 0) {
        throw new Error(`TypeScript syntax errors:\n${syntaxErrors.join('\n')}`);
      }

      // 2. Validate source code security
      this.securityValidator.validateSource(source);

      // 3. Wrap the source code to ensure it returns a system
      const wrappedSource = this.wrapSourceCode(source);

      // 4. Compile TypeScript to JavaScript
      const compiledJS = this.tsCompiler.compile(wrappedSource, filename || 'user-system.ts');

      // 5. Execute in secure sandbox
      const result = this.executeInSandbox(compiledJS, filename);
      
      if (!result || typeof result !== 'object' || typeof result.execute !== 'function') {
        throw new Error('System source must export a valid system definition');
      }

      // 6. Generate unique system ID for deployment
      const originalName = result.name || 'UnnamedSystem';
      const uniqueSystemId = this.generateUniqueSystemId(originalName, deploymentOptions);

      // 7. Create UserSystem with unique ID
      const userSystem = new UserSystem({
        name: uniqueSystemId,
        required: result.required || [],
        execute: result.execute,
        init: result.init,
        cleanup: result.cleanup,
        gasConfig: { ...this.config.defaultGasConfig, ...result.gasConfig },
      });

      // Store original name as metadata for debugging
      (userSystem as any).originalName = originalName;
      (userSystem as any).deploymentId = uniqueSystemId;

      const loadTime = performance.now() - startTime;

      // 8. Cache the loaded system
      const loadResult: LoadResult = {
        system: userSystem,
        source,
        compiledJS,
        loadTime,
      };
      this.loadedSystems.set(userSystem.name, loadResult);

      return userSystem;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load system: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Load a system from a file path
   * @param filePath Path to TypeScript file
   * @returns Loaded system
   */
  async loadFromFile(filePath: string): Promise<UserSystem> {
    try {
      // Resolve file path relative to working directory
      const workingDir = this.config.workingDirectory ?? process.cwd();
      const resolvedPath = path.resolve(workingDir, filePath);
      
      // Security check: ensure file is within working directory
      if (!resolvedPath.startsWith(path.resolve(workingDir))) {
        throw new Error(`File path '${filePath}' is outside working directory`);
      }

      // Check if file exists
      if (!(await fs.pathExists(resolvedPath))) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Read file content
      const source = await fs.readFile(resolvedPath, 'utf8');
      
      // Load from source
      return this.loadFromSource(source, path.basename(filePath));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load system from file '${filePath}': ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get a loaded system by name
   * @param name System name
   * @returns Loaded system or undefined
   */
  getLoadedSystem(name: string): UserSystem | undefined {
    return this.loadedSystems.get(name)?.system;
  }

  /**
   * Get all loaded systems
   * @returns Array of loaded systems
   */
  getAllLoadedSystems(): UserSystem[] {
    return Array.from(this.loadedSystems.values()).map(result => result.system);
  }

  /**
   * Get load statistics for a system
   * @param name System name
   * @returns Load result or undefined
   */
  getLoadResult(name: string): LoadResult | undefined {
    return this.loadedSystems.get(name);
  }

  /**
   * Unload a system
   * @param name System name
   */
  unloadSystem(name: string): void {
    this.loadedSystems.delete(name);
  }

  /**
   * Clear all loaded systems
   */
  clear(): void {
    this.loadedSystems.clear();
  }

  /**
   * Wrap source code to ensure it returns a system
   */
  private wrapSourceCode(source: string): string {
    return `
      // Global type declarations for sandbox
      declare function getComponent(name: string): any;
      declare function defineSystem(name: string, definition: any): any;
      declare var console: any;
      declare var Math: any;
      declare var Object: any;
      declare var Array: any;
      declare var String: any;
      declare var Number: any;
      declare var Boolean: any;
      declare var JSON: any;
      declare var Error: any;
      
      // User-defined system code with automatic system capture
      (function() {
        let _capturedSystem = null;
        
        // Override defineSystem to capture the result
        const originalDefineSystem = defineSystem;
        defineSystem = function(name, definition) {
          const system = originalDefineSystem(name, definition);
          _capturedSystem = system;
          return system;
        };
        
        // Execute user code
        ${source}
        
        // Return the captured system
        return _capturedSystem;
      })();
    `;
  }

  /**
   * Create a secure sandbox for executing user code
   */
  private createSecureSandbox(): Record<string, any> {
    // Provide access to component registry for looking up components
    const getComponent = (name: string): ComponentType | undefined => {
      return componentRegistry.getType(name);
    };

    // Create the sandbox object first
    const sandbox: Record<string, any> = {};

    // Provide the defineSystem API that captures the result
    const defineSystemAPI = (name: string, definition: Omit<UserSystemDefinition, 'name'>): UserSystem => {
      const system = defineSystem(name, definition);
      return system;
    };

    // Create completely clean Math object
    const safeMath = {
      E: Math.E,
      LN10: Math.LN10,
      LN2: Math.LN2,
      LOG10E: Math.LOG10E,
      LOG2E: Math.LOG2E,
      PI: Math.PI,
      SQRT1_2: Math.SQRT1_2,
      SQRT2: Math.SQRT2,
      abs: Math.abs,
      acos: Math.acos,
      acosh: Math.acosh,
      asin: Math.asin,
      asinh: Math.asinh,
      atan: Math.atan,
      atan2: Math.atan2,
      atanh: Math.atanh,
      cbrt: Math.cbrt,
      ceil: Math.ceil,
      clz32: Math.clz32,
      cos: Math.cos,
      cosh: Math.cosh,
      exp: Math.exp,
      expm1: Math.expm1,
      floor: Math.floor,
      fround: Math.fround,
      hypot: Math.hypot,
      imul: Math.imul,
      log: Math.log,
      log10: Math.log10,
      log1p: Math.log1p,
      log2: Math.log2,
      max: Math.max,
      min: Math.min,
      pow: Math.pow,
      round: Math.round,
      sign: Math.sign,
      sin: Math.sin,
      sinh: Math.sinh,
      sqrt: Math.sqrt,
      tan: Math.tan,
      tanh: Math.tanh,
      trunc: Math.trunc,
      // Explicitly exclude:
      // random - non-deterministic
    };

    // Add all the other sandbox properties
    Object.assign(sandbox, {
      // Core APIs
      defineSystem: defineSystemAPI,
      getComponent,
      
      // Safe built-ins
      console: {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
      },
      Math: safeMath,
      Object: {
        keys: Object.keys,
        values: Object.values,
        entries: Object.entries,
        assign: Object.assign,
        create: Object.create,
        freeze: Object.freeze,
        seal: Object.seal,
        // Explicitly exclude dangerous methods
      },
      Array: {
        from: Array.from,
        isArray: Array.isArray,
        of: Array.of,
      },
      String,
      Number: {
        isFinite: Number.isFinite,
        isInteger: Number.isInteger,
        isNaN: Number.isNaN,
        isSafeInteger: Number.isSafeInteger,
        parseFloat: Number.parseFloat,
        parseInt: Number.parseInt,
        EPSILON: Number.EPSILON,
        MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
        MAX_VALUE: Number.MAX_VALUE,
        MIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER,
        MIN_VALUE: Number.MIN_VALUE,
        NEGATIVE_INFINITY: Number.NEGATIVE_INFINITY,
        POSITIVE_INFINITY: Number.POSITIVE_INFINITY,
        NaN: Number.NaN,
      },
      Boolean,
      JSON: {
        parse: JSON.parse,
        stringify: JSON.stringify,
      },
      Error,
      
      // Blocked globals (set to undefined to prevent access)
      Date: undefined,
      setTimeout: undefined,
      setInterval: undefined,
      clearTimeout: undefined,
      clearInterval: undefined,
      eval: undefined,
      Function: undefined,
      require: undefined,
      module: undefined,
      exports: undefined,
      process: undefined,
      global: undefined,
      window: undefined,
      document: undefined,
      XMLHttpRequest: undefined,
      fetch: undefined,
      WebSocket: undefined,
      localStorage: undefined,
      sessionStorage: undefined,
      indexedDB: undefined,
    });

    return sandbox;
  }

  /**
   * Execute code in secure sandbox
   */
  private executeInSandbox(compiledJS: string, filename?: string): any {
    const vm = new VM({
      timeout: this.config.vmTimeout || 5000,
      sandbox: this.createSecureSandbox(),
    });

    return vm.run(compiledJS);
  }

  /**
   * Generate a unique system ID for deployment
   */
  private generateUniqueSystemId(
    originalName: string, 
    options?: { uniqueId?: string; instanceSuffix?: string }
  ): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    
    if (options?.uniqueId) {
      return `${originalName}_${options.uniqueId}`;
    }
    
    if (options?.instanceSuffix) {
      return `${originalName}_${options.instanceSuffix}_${timestamp}`;
    }
    
    // Default: originalName + timestamp + random
    return `${originalName}_${timestamp}_${random}`;
  }
}

/**
 * Default system loader instance
 */
export const systemLoader = new SystemLoader(); 