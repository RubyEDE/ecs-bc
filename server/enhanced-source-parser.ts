import { ComponentUsage } from './component-name-resolver';

/**
 * Enhanced function parameter information
 */
export interface FunctionParameter {
  name: string;
  type?: string;
  required: boolean;
  default?: any;
  description?: string;
}

/**
 * Enhanced executable definition with parameter details
 */
export interface EnhancedExecutableDefinition {
  name: string;
  parameters: FunctionParameter[];
  description?: string;
  returnType?: string;
}

/**
 * Component schema with detailed field information
 */
export interface ComponentSchema {
  name: string;
  fields: Record<string, FunctionParameter>;
  version: number;
  description?: string;
}

/**
 * Enhanced source code parser for better IDE support
 */
export class EnhancedSourceParser {
  
  /**
   * Extract function parameters with detailed type information
   */
  extractFunctionParameters(source: string): EnhancedExecutableDefinition[] {
    const executables: EnhancedExecutableDefinition[] = [];

    try {
      // Find the execute object
      const executeRegex = /execute\s*:\s*\{/;
      const executeMatch = source.match(executeRegex);
      
      if (!executeMatch) {
        return executables;
      }

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
      
      // Enhanced pattern matching for function definitions
      
      // Pattern 1: Arrow functions with detailed parameter analysis
      const arrowFunctionPattern = /(\w+)\s*:\s*\(\s*ctx\s*(?:,\s*([^)]*))?\s*\)\s*=>\s*\{([\s\S]*?)(?=\n\s*(?:\w+\s*:|$|\}))/g;
      let match;
      
      while ((match = arrowFunctionPattern.exec(executeBody)) !== null) {
        const functionName = match[1];
        const parametersStr = match[2];
        const functionBody = match[3];
        
        const parameters = this.parseDetailedParameters(parametersStr);
        const description = this.extractFunctionDescription(functionBody, functionName);
        
        executables.push({
          name: functionName,
          parameters,
          description,
          returnType: this.inferReturnType(functionBody)
        });
      }
      
      // Pattern 2: Function expressions with TypeScript annotations
      const functionExpressionPattern = /(\w+)\s*:\s*function\s*\(\s*ctx\s*(?:,\s*([^)]*))?\s*\)(?:\s*:\s*([\w<>[\]|]+))?\s*\{([\s\S]*?)(?=\n\s*(?:\w+\s*:|$|\}))/g;
      
      while ((match = functionExpressionPattern.exec(executeBody)) !== null) {
        const functionName = match[1];
        const parametersStr = match[2];
        const returnTypeAnnotation = match[3];
        const functionBody = match[4];
        
        // Skip if we already found this function
        if (!executables.some(e => e.name === functionName)) {
          const parameters = this.parseDetailedParameters(parametersStr);
          const description = this.extractFunctionDescription(functionBody, functionName);
          
          executables.push({
            name: functionName,
            parameters,
            description,
            returnType: returnTypeAnnotation || this.inferReturnType(functionBody)
          });
        }
      }

    } catch (error) {
      console.warn('Error in enhanced function parameter extraction:', error);
    }

    return executables;
  }

  /**
   * Parse parameters with detailed type and default information
   */
  private parseDetailedParameters(parametersStr?: string): FunctionParameter[] {
    const parameters: FunctionParameter[] = [];
    
    if (!parametersStr || !parametersStr.trim()) {
      return parameters;
    }

    try {
      // Split parameters while respecting nested braces and brackets
      const paramStrings = this.splitParameters(parametersStr);
      
      for (const paramStr of paramStrings) {
        const param = this.parseParameter(paramStr.trim());
        if (param) {
          parameters.push(param);
        }
      }
    } catch (error) {
      console.warn('Error parsing detailed parameters:', error);
    }

    return parameters;
  }

  /**
   * Split parameter string while respecting nested structures
   */
  private splitParameters(parametersStr: string): string[] {
    const params: string[] = [];
    let currentParam = '';
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < parametersStr.length; i++) {
      const char = parametersStr[i];
      
      if (!inString) {
        if (char === '"' || char === "'" || char === '`') {
          inString = true;
          stringChar = char;
        } else if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
        } else if (char === '[') {
          bracketCount++;
        } else if (char === ']') {
          bracketCount--;
        } else if (char === ',' && braceCount === 0 && bracketCount === 0) {
          params.push(currentParam.trim());
          currentParam = '';
          continue;
        }
      } else if (char === stringChar && parametersStr[i - 1] !== '\\') {
        inString = false;
        stringChar = '';
      }
      
      currentParam += char;
    }
    
    if (currentParam.trim()) {
      params.push(currentParam.trim());
    }
    
    return params;
  }

  /**
   * Parse a single parameter with type annotations and defaults
   */
  private parseParameter(paramStr: string): FunctionParameter | null {
    try {
      // Handle destructuring: { name, health = 100 }: { name: string, health?: number }
      const destructuringMatch = paramStr.match(/^\{\s*([^}]+)\s*\}(?:\s*:\s*\{([^}]+)\})?(?:\s*=\s*(.+))?$/);
      if (destructuringMatch) {
        const destructuredFields = destructuringMatch[1];
        const typeAnnotation = destructuringMatch[2];
        const defaultValue = destructuringMatch[3];
        
        // For now, treat destructured parameters as a single object parameter
        return {
          name: 'args',
          type: 'object',
          required: !defaultValue,
          default: defaultValue ? this.parseDefaultValue(defaultValue) : undefined,
          description: `Object containing: ${destructuredFields}`
        };
      }

      // Handle regular parameters: paramName: type = defaultValue
      const regularMatch = paramStr.match(/^(\w+)(?:\s*:\s*([\w<>[\]|]+))?\s*(?:=\s*(.+))?$/);
      if (regularMatch) {
        const paramName = regularMatch[1];
        const typeAnnotation = regularMatch[2];
        const defaultValue = regularMatch[3];
        
        return {
          name: paramName,
          type: typeAnnotation || this.inferParameterType(defaultValue),
          required: !defaultValue,
          default: defaultValue ? this.parseDefaultValue(defaultValue) : undefined
        };
      }

      // Fallback for simple parameter names
      const simpleMatch = paramStr.match(/^(\w+)$/);
      if (simpleMatch) {
        return {
          name: simpleMatch[1],
          type: 'any',
          required: true
        };
      }

    } catch (error) {
      console.warn('Error parsing parameter:', paramStr, error);
    }

    return null;
  }

  /**
   * Parse default value and determine its type
   */
  private parseDefaultValue(defaultStr: string): any {
    const trimmed = defaultStr.trim();
    
    // Boolean
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    
    // Null/undefined
    if (trimmed === 'null') return null;
    if (trimmed === 'undefined') return undefined;
    
    // Number
    const numberMatch = trimmed.match(/^-?\d+(\.\d+)?$/);
    if (numberMatch) {
      return parseFloat(trimmed);
    }
    
    // String
    const stringMatch = trimmed.match(/^['"`](.*)['"`]$/);
    if (stringMatch) {
      return stringMatch[1];
    }
    
    // Array
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    
    // Object
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    
    return trimmed;
  }

  /**
   * Infer parameter type from default value
   */
  private inferParameterType(defaultValue?: string): string {
    if (!defaultValue) return 'any';
    
    const trimmed = defaultValue.trim();
    
    if (trimmed === 'true' || trimmed === 'false') return 'boolean';
    if (trimmed.match(/^-?\d+(\.\d+)?$/)) return 'number';
    if (trimmed.match(/^['"`].*['"`]$/)) return 'string';
    if (trimmed.startsWith('[')) return 'array';
    if (trimmed.startsWith('{')) return 'object';
    
    return 'any';
  }

  /**
   * Extract function description from comments or function body
   */
  private extractFunctionDescription(functionBody: string, functionName: string): string | undefined {
    // Look for comments at the start of the function
    const commentMatch = functionBody.match(/^\s*\/\*\*([\s\S]*?)\*\//);
    if (commentMatch) {
      return commentMatch[1]
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, '').trim())
        .filter(line => line.length > 0)
        .join(' ');
    }
    
    // Look for single-line comments
    const singleCommentMatch = functionBody.match(/^\s*\/\/\s*(.+)/);
    if (singleCommentMatch) {
      return singleCommentMatch[1].trim();
    }
    
    // Generate description based on function name
    if (functionName.startsWith('create')) {
      return `Creates a new ${functionName.replace('create', '').toLowerCase()}`;
    } else if (functionName.startsWith('update')) {
      return `Updates an existing ${functionName.replace('update', '').toLowerCase()}`;
    } else if (functionName.startsWith('delete') || functionName.startsWith('remove')) {
      return `Removes a ${functionName.replace(/delete|remove/, '').toLowerCase()}`;
    }
    
    return undefined;
  }

  /**
   * Infer return type from function body
   */
  private inferReturnType(functionBody: string): string {
    // Look for explicit return statements
    const returnMatch = functionBody.match(/return\s+([^;]+)/);
    if (returnMatch) {
      const returnValue = returnMatch[1].trim();
      
      if (returnValue.match(/^[\d.]+$/)) return 'number';
      if (returnValue.match(/^['"`]/)) return 'string';
      if (returnValue === 'true' || returnValue === 'false') return 'boolean';
      if (returnValue.startsWith('{')) return 'object';
      if (returnValue.startsWith('[')) return 'array';
      if (returnValue.match(/^entity\b/)) return 'Entity';
    }
    
    // Look for ctx.createEntity calls
    if (functionBody.includes('ctx.createEntity')) {
      return 'Entity';
    }
    
    return 'void';
  }

  /**
   * Extract component schemas from defineComponent calls
   */
  extractComponentSchemas(source: string): ComponentSchema[] {
    const schemas: ComponentSchema[] = [];

    try {
      const defineComponentRegex = /ctx\.defineComponent\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\{[\s\S]*?\})\s*\)/g;
      let match;

      while ((match = defineComponentRegex.exec(source)) !== null) {
        const componentName = match[1];
        const schemaStr = match[2];
        
        const schema = this.parseComponentSchema(componentName, schemaStr);
        if (schema) {
          schemas.push(schema);
        }
      }
    } catch (error) {
      console.warn('Error extracting component schemas:', error);
    }

    return schemas;
  }

  /**
   * Parse component schema with detailed field information
   */
  private parseComponentSchema(componentName: string, schemaStr: string): ComponentSchema | null {
    try {
      // Extract version
      let version = 1;
      const versionMatch = schemaStr.match(/version\s*:\s*(\d+)/);
      if (versionMatch) {
        version = parseInt(versionMatch[1], 10);
      }

      // Extract fields section
      const fieldsMatch = schemaStr.match(/fields\s*:\s*\{([\s\S]*)\}(?=\s*\})/);
      if (!fieldsMatch) {
        return {
          name: componentName,
          fields: {},
          version,
          description: `Component ${componentName} (no field details available)`
        };
      }

      const fieldsStr = fieldsMatch[1];
      const fields = this.parseSchemaFields(fieldsStr);

      return {
        name: componentName,
        fields,
        version,
        description: `Component ${componentName} with ${Object.keys(fields).length} fields`
      };

    } catch (error) {
      console.warn(`Error parsing component schema for ${componentName}:`, error);
      return null;
    }
  }

  /**
   * Parse schema fields with detailed type information
   */
  private parseSchemaFields(fieldsStr: string): Record<string, FunctionParameter> {
    const fields: Record<string, FunctionParameter> = {};

    try {
      // Match field definitions: fieldName: { type: 'string', required: true, ... }
      const fieldRegex = /(\w+)\s*:\s*\{([^{}]*(?:\{[^}]*\}[^{}]*)*)\}/g;
      let fieldMatch;

      while ((fieldMatch = fieldRegex.exec(fieldsStr)) !== null) {
        const fieldName = fieldMatch[1];
        const fieldDefStr = fieldMatch[2];
        
        const fieldDef = this.parseFieldDefinition(fieldDefStr);
        if (fieldDef) {
          fields[fieldName] = {
            name: fieldName,
            type: fieldDef.type || 'any',
            required: fieldDef.required !== undefined ? fieldDef.required : true,
            default: fieldDef.default,
            description: fieldDef.description
          };
        }
      }
    } catch (error) {
      console.warn('Error parsing schema fields:', error);
    }

    return fields;
  }

  /**
   * Parse a single field definition
   */
  private parseFieldDefinition(fieldDefStr: string): Partial<FunctionParameter> | null {
    try {
      const fieldDef: Partial<FunctionParameter> = {};

      // Extract type
      const typeMatch = fieldDefStr.match(/type\s*:\s*['"`]([^'"`]+)['"`]/);
      if (typeMatch) {
        fieldDef.type = typeMatch[1];
      }

      // Extract required
      const requiredMatch = fieldDefStr.match(/required\s*:\s*(true|false)/);
      fieldDef.required = requiredMatch ? requiredMatch[1] === 'true' : true;

      // Extract default value
      const defaultMatch = fieldDefStr.match(/default\s*:\s*([^,}]+)/);
      if (defaultMatch) {
        fieldDef.default = this.parseDefaultValue(defaultMatch[1]);
        fieldDef.required = false; // Has default, so not required
      }

      // Extract min/max constraints
      const minMatch = fieldDefStr.match(/min\s*:\s*(\d+)/);
      if (minMatch) {
        fieldDef.description = (fieldDef.description || '') + ` Min: ${minMatch[1]}`;
      }

      const maxMatch = fieldDefStr.match(/max\s*:\s*(\d+)/);
      if (maxMatch) {
        fieldDef.description = (fieldDef.description || '') + ` Max: ${maxMatch[1]}`;
      }

      // Ensure required is always set to a boolean value
      if (fieldDef.required === undefined) {
        fieldDef.required = true;
      }

      return fieldDef;

    } catch (error) {
      console.warn('Error parsing field definition:', error);
      return null;
    }
  }

  /**
   * Find which components the system reads/writes/creates
   */
  findComponentUsage(source: string): ComponentUsage {
    const usage: ComponentUsage = {
      reads: [],
      writes: [],
      creates: []
    };

    try {
      // Find defineComponent calls (creates)
      const defineRegex = /ctx\.defineComponent\s*\(\s*['"`]([^'"`]+)['"`]/g;
      let match;
      while ((match = defineRegex.exec(source)) !== null) {
        usage.creates.push(match[1]);
      }

      // Find getComponent calls (reads)
      const getRegex = /ctx\.getComponent\s*\([^,]+,\s*['"`]([^'"`]+)['"`]/g;
      while ((match = getRegex.exec(source)) !== null) {
        if (!usage.reads.includes(match[1])) {
          usage.reads.push(match[1]);
        }
      }

      // Find updateComponent calls (writes)
      const updateRegex = /ctx\.updateComponent\s*\([^,]+,\s*['"`]([^'"`]+)['"`]/g;
      while ((match = updateRegex.exec(source)) !== null) {
        if (!usage.writes.includes(match[1])) {
          usage.writes.push(match[1]);
        }
      }

    } catch (error) {
      console.warn('Error finding component usage:', error);
    }

    return usage;
  }
}

// Global instance
export const enhancedSourceParser = new EnhancedSourceParser(); 