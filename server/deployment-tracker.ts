import { ComponentRegistration, EntityId, ComponentSchema } from '../src/core/types';

// Use the actual system ID type from the ECS implementation
export type SystemId = number;

export interface ExecutableDefinition {
  name: string;
  parameters?: string[];
}

export interface ComponentDefinition {
  name: string;
  version: number;
  schema: ComponentSchema;
}

export interface EntityInfo {
  entityId: EntityId;
  owner: SystemId;
  components: Record<string, any>;
}

export interface SystemDeploymentInfo {
  systemId: SystemId;
  name: string;
  executables: ExecutableDefinition[];
  components: ComponentDefinition[];
  entities: EntityInfo[];
  requiredComponents: string[];
  deployedAt: number;
  originalSource: string;
}

/**
 * Tracks system deployment information
 */
export class DeploymentTracker {
  private deploymentInfo = new Map<SystemId, SystemDeploymentInfo>();

  /**
   * Parse TypeScript source to extract executable function definitions
   */
  extractExecutables(source: string): ExecutableDefinition[] {
    const executables: ExecutableDefinition[] = [];

    try {
      // Find the execute object using a more robust approach
      const executeRegex = /execute\s*:\s*\{/;
      const executeMatch = source.match(executeRegex);
      
      if (!executeMatch) {
        return executables;
      }

      // Find the start of the execute object
      const startIndex = executeMatch.index! + executeMatch[0].length;
      
      // Find the matching closing brace
      let braceCount = 1;
      let endIndex = startIndex;
      
      for (let i = startIndex; i < source.length && braceCount > 0; i++) {
        if (source[i] === '{') {
          braceCount++;
        } else if (source[i] === '}') {
          braceCount--;
        }
        endIndex = i;
      }
      
      const executeBody = source.slice(startIndex, endIndex);
      
      // Parse different function definition patterns
      
      // Pattern 1: Arrow functions - functionName: (ctx, args) => { ... }
      const arrowFunctionPattern = /(\w+)\s*:\s*\(\s*ctx\s*(?:,\s*([^)]*))?\s*\)\s*=>/g;
      let match;
      
      while ((match = arrowFunctionPattern.exec(executeBody)) !== null) {
        const functionName = match[1];
        const parametersStr = match[2];
        
        const parameters: string[] = [];
        if (parametersStr && parametersStr.trim()) {
          // Parse parameter names
          const paramNames = parametersStr
            .split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .map(p => {
              // Extract parameter name (handle destructuring, defaults, etc.)
              const cleanParam = p.split('=')[0].trim(); // Remove defaults
              const nameMatch = cleanParam.match(/(\w+)/);
              return nameMatch ? nameMatch[1] : p;
            });
          parameters.push(...paramNames);
        }

        executables.push({
          name: functionName,
          parameters: parameters.length > 0 ? parameters : undefined
        });
      }
      
      // Pattern 2: Regular function assignments - functionName: function(ctx, args) { ... }
      const functionAssignmentPattern = /(\w+)\s*:\s*function\s*\(\s*ctx\s*(?:,\s*([^)]*))?\s*\)/g;
      while ((match = functionAssignmentPattern.exec(executeBody)) !== null) {
        const functionName = match[1];
        const parametersStr = match[2];
        
        // Skip if we already found this function
        if (!executables.some(e => e.name === functionName)) {
          const parameters: string[] = [];
          if (parametersStr && parametersStr.trim()) {
            const paramNames = parametersStr
              .split(',')
              .map(p => p.trim())
              .filter(p => p.length > 0)
              .map(p => {
                const cleanParam = p.split('=')[0].trim();
                const nameMatch = cleanParam.match(/(\w+)/);
                return nameMatch ? nameMatch[1] : p;
              });
            parameters.push(...paramNames);
          }

          executables.push({
            name: functionName,
            parameters: parameters.length > 0 ? parameters : undefined
          });
        }
      }
      
      // Pattern 3: Direct function calls - functionName(ctx, args) (for backward compatibility)
      const functionCallPattern = /(\w+)\s*\(\s*ctx\s*(?:,\s*([^)]*))?\s*\)/g;
      while ((match = functionCallPattern.exec(executeBody)) !== null) {
        const functionName = match[1];
        const parametersStr = match[2];
        
        // Skip if we already found this function
        if (!executables.some(e => e.name === functionName)) {
          const parameters: string[] = [];
          if (parametersStr && parametersStr.trim()) {
            const paramNames = parametersStr
              .split(',')
              .map(p => p.trim())
              .filter(p => p.length > 0)
              .map(p => {
                const cleanParam = p.split('=')[0].trim();
                const nameMatch = cleanParam.match(/(\w+)/);
                return nameMatch ? nameMatch[1] : p;
              });
            parameters.push(...paramNames);
          }

          executables.push({
            name: functionName,
            parameters: parameters.length > 0 ? parameters : undefined
          });
        }
      }

      // Also check for direct function assignments: execute.functionName = ...
      const directAssignRegex = /execute\.(\w+)\s*=/g;
      let directMatch;
      while ((directMatch = directAssignRegex.exec(source)) !== null) {
        const functionName = directMatch[1];
        if (!executables.some(e => e.name === functionName)) {
          executables.push({ name: functionName });
        }
      }

    } catch (error) {
      console.warn('Error parsing executables from source:', error);
    }

    return executables;
  }

  /**
   * Parse TypeScript source to extract component definitions
   */
  extractComponentDefinitions(source: string): ComponentDefinition[] {
    const components: ComponentDefinition[] = [];

    try {
      // Look for ctx.defineComponent calls with a more flexible approach
      const defineComponentRegex = /ctx\.defineComponent\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\{[\s\S]*?\})\s*\)/g;
      let match;

      while ((match = defineComponentRegex.exec(source)) !== null) {
        const componentName = match[1];
        const schemaStr = match[2];

        try {
          // Try to extract version
          let version = 1;
          const versionMatch = schemaStr.match(/version\s*:\s*(\d+)/);
          if (versionMatch) {
            version = parseInt(versionMatch[1], 10);
          }

          // Extract field definitions in a simpler way
          const fieldsStr = this.extractFieldsSection(schemaStr);
          const fields = this.parseFieldsSimple(fieldsStr);

          const component: ComponentDefinition = {
            name: componentName,
            version,
            schema: {
              version,
              fields,
              constraints: []
            }
          };

          components.push(component);
        } catch (parseError) {
          console.warn(`Failed to parse component schema for ${componentName}:`, parseError);
          // Add component with basic info even if schema parsing fails
          components.push({
            name: componentName,
            version: 1,
            schema: {
              version: 1,
              fields: { [componentName]: { type: 'object' } },
              constraints: []
            }
          });
        }
      }

    } catch (error) {
      console.warn('Error parsing component definitions from source:', error);
    }

    return components;
  }

  /**
   * Extract the fields section from a component schema
   */
  private extractFieldsSection(schemaStr: string): string {
    const fieldsMatch = schemaStr.match(/fields\s*:\s*\{([\s\S]*)\}(?=\s*\})/);
    return fieldsMatch ? fieldsMatch[1] : '';
  }

  /**
   * Parse fields in a simpler, more reliable way
   */
  private parseFieldsSimple(fieldsStr: string): Record<string, any> {
    const fields: Record<string, any> = {};

    if (!fieldsStr.trim()) return fields;

    try {
      // More precise regex to match field definitions
      // Match: fieldName: { ... } including nested braces
      const fieldRegex = /(\w+)\s*:\s*\{([^{}]*(?:\{[^}]*\}[^{}]*)*)\}/g;
      let fieldMatch;

      while ((fieldMatch = fieldRegex.exec(fieldsStr)) !== null) {
        const fieldName = fieldMatch[1];
        const fieldDefStr = fieldMatch[2];
        const fieldDef: any = {};

        // Extract type
        const typeMatch = fieldDefStr.match(/type\s*:\s*['"`]([^'"`]+)['"`]/);
        if (typeMatch) {
          fieldDef.type = typeMatch[1];
        }

        // Extract required
        const requiredMatch = fieldDefStr.match(/required\s*:\s*(true|false)/);
        if (requiredMatch) {
          fieldDef.required = requiredMatch[1] === 'true';
        }

        // Extract min/max
        const minMatch = fieldDefStr.match(/min\s*:\s*(\d+)/);
        if (minMatch) {
          fieldDef.min = parseInt(minMatch[1], 10);
        }

        const maxMatch = fieldDefStr.match(/max\s*:\s*(\d+)/);
        if (maxMatch) {
          fieldDef.max = parseInt(maxMatch[1], 10);
        }

        // For nested objects, just mark as object type for now
        if (fieldDef.type === 'object' && fieldDefStr.includes('nested')) {
          fieldDef.nested = true;
          fieldDef.description = `Nested object with sub-fields`;
        }

        fields[fieldName] = fieldDef;
      }
    } catch (error) {
      console.warn('Error in parseFieldsSimple:', error);
    }

    return fields;
  }

  /**
   * Parse schema fields from a component definition string
   */
  private parseSchemaFields(schemaStr: string): Record<string, any> {
    // Delegate to the simpler parsing method
    const fieldsStr = this.extractFieldsSection(schemaStr);
    return this.parseFieldsSimple(fieldsStr);
  }

  /**
   * Initialize tracking for a new deployment
   */
  startTracking(systemId: SystemId, systemName: string, source: string, requiredComponents: string[]): void {
    const executables = this.extractExecutables(source);
    const components = this.extractComponentDefinitions(source);
    
    this.deploymentInfo.set(systemId, {
      systemId,
      name: systemName,
      executables,
      components,
      entities: [],
      requiredComponents,
      deployedAt: Date.now(),
      originalSource: source
    });
  }

  /**
   * Record a component definition during deployment
   */
  trackComponent(systemId: SystemId, component: ComponentDefinition): void {
    const info = this.deploymentInfo.get(systemId);
    if (info) {
      info.components.push(component);
    }
  }

  /**
   * Record an entity creation during deployment
   */
  trackEntity(systemId: SystemId, entity: EntityInfo): void {
    const info = this.deploymentInfo.get(systemId);
    if (info) {
      info.entities.push(entity);
    }
  }

  /**
   * Get deployment information for a system
   */
  getDeploymentInfo(systemId: SystemId): SystemDeploymentInfo | undefined {
    return this.deploymentInfo.get(systemId);
  }

  /**
   * Get all deployment information
   */
  getAllDeploymentInfo(): SystemDeploymentInfo[] {
    return Array.from(this.deploymentInfo.values());
  }

  /**
   * Remove deployment information (when system is unloaded)
   */
  removeDeploymentInfo(systemId: SystemId): void {
    this.deploymentInfo.delete(systemId);
  }
}

// Global instance
export const deploymentTracker = new DeploymentTracker(); 