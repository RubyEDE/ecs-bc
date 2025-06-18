import { ComponentSchema, FieldDefinition, Constraint } from '../types';

/**
 * Component schema validator for runtime validation
 */
export class ComponentSchemaValidator {
  /**
   * Validate a component schema
   */
  validateSchema(schema: ComponentSchema): void {
    if (!schema || typeof schema !== 'object') {
      throw new Error('Schema must be an object');
    }

    if (typeof schema.version !== 'number' || schema.version < 1) {
      throw new Error('Schema version must be a positive number');
    }

    if (!schema.fields || typeof schema.fields !== 'object') {
      throw new Error('Schema must have fields definition');
    }

    if (Object.keys(schema.fields).length === 0) {
      throw new Error('Schema must have at least one field');
    }

    // Validate each field definition
    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
      this.validateFieldDefinition(fieldName, fieldDef);
    }

    // Validate constraints if provided
    if (schema.constraints) {
      for (const constraint of schema.constraints) {
        this.validateConstraint(constraint, schema.fields);
      }
    }

    // Validate max size
    if (schema.maxSize !== undefined) {
      if (typeof schema.maxSize !== 'number' || schema.maxSize <= 0) {
        throw new Error('Schema maxSize must be a positive number');
      }
    }
  }

  /**
   * Validate component data against its schema
   */
  validateData(data: any, schema: ComponentSchema): void {
    if (data === null || data === undefined) {
      throw new Error('Component data cannot be null or undefined');
    }

    if (typeof data !== 'object') {
      throw new Error('Component data must be an object');
    }

    // Check max size if specified
    if (schema.maxSize && this.getObjectSize(data) > schema.maxSize) {
      throw new Error(`Component data exceeds maximum size of ${schema.maxSize} bytes`);
    }

    // Validate each field
    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
      const fieldValue = data[fieldName];

      // Check required fields
      if (fieldDef.required && (fieldValue === undefined || fieldValue === null)) {
        throw new Error(`Required field '${fieldName}' is missing`);
      }

      // Validate field value if present
      if (fieldValue !== undefined && fieldValue !== null) {
        this.validateFieldValue(fieldName, fieldValue, fieldDef);
      }
    }

    // Check for unexpected fields
    for (const fieldName of Object.keys(data)) {
      if (!schema.fields[fieldName]) {
        throw new Error(`Unexpected field '${fieldName}' not defined in schema`);
      }
    }

    // Validate constraints
    if (schema.constraints) {
      for (const constraint of schema.constraints) {
        this.validateConstraintAgainstData(constraint, data);
      }
    }
  }

  /**
   * Validate a field definition
   */
  private validateFieldDefinition(fieldName: string, fieldDef: FieldDefinition): void {
    if (!fieldDef || typeof fieldDef !== 'object') {
      throw new Error(`Field definition for '${fieldName}' must be an object`);
    }

    const validTypes = ['number', 'string', 'boolean', 'object', 'array'];
    if (!validTypes.includes(fieldDef.type)) {
      throw new Error(`Invalid field type '${fieldDef.type}' for field '${fieldName}'`);
    }

    // Validate numeric constraints
    if (fieldDef.min !== undefined && typeof fieldDef.min !== 'number') {
      throw new Error(`Field '${fieldName}' min constraint must be a number`);
    }

    if (fieldDef.max !== undefined && typeof fieldDef.max !== 'number') {
      throw new Error(`Field '${fieldName}' max constraint must be a number`);
    }

    if (fieldDef.min !== undefined && fieldDef.max !== undefined && fieldDef.min > fieldDef.max) {
      throw new Error(`Field '${fieldName}' min cannot be greater than max`);
    }

    // Validate pattern for string fields
    if (fieldDef.pattern && fieldDef.type !== 'string') {
      throw new Error(`Field '${fieldName}' pattern constraint can only be used with string type`);
    }

    // Validate nested schema for object/array fields
    if (fieldDef.nested) {
      if (fieldDef.type !== 'object' && fieldDef.type !== 'array') {
        throw new Error(`Field '${fieldName}' nested schema can only be used with object or array type`);
      }
      this.validateSchema(fieldDef.nested);
    }
  }

  /**
   * Validate a field value against its definition
   */
  private validateFieldValue(fieldName: string, value: any, fieldDef: FieldDefinition): void {
    // Type validation
    switch (fieldDef.type) {
      case 'number':
        if (typeof value !== 'number' || !isFinite(value)) {
          throw new Error(`Field '${fieldName}' must be a finite number`);
        }
        if (fieldDef.min !== undefined && value < fieldDef.min) {
          throw new Error(`Field '${fieldName}' value ${value} is below minimum ${fieldDef.min}`);
        }
        if (fieldDef.max !== undefined && value > fieldDef.max) {
          throw new Error(`Field '${fieldName}' value ${value} is above maximum ${fieldDef.max}`);
        }
        break;

      case 'string':
        if (typeof value !== 'string') {
          throw new Error(`Field '${fieldName}' must be a string`);
        }
        if (fieldDef.min !== undefined && value.length < fieldDef.min) {
          throw new Error(`Field '${fieldName}' length ${value.length} is below minimum ${fieldDef.min}`);
        }
        if (fieldDef.max !== undefined && value.length > fieldDef.max) {
          throw new Error(`Field '${fieldName}' length ${value.length} is above maximum ${fieldDef.max}`);
        }
        if (fieldDef.pattern && !fieldDef.pattern.test(value)) {
          throw new Error(`Field '${fieldName}' value does not match required pattern`);
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new Error(`Field '${fieldName}' must be a boolean`);
        }
        break;

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          throw new Error(`Field '${fieldName}' must be an object`);
        }
        if (fieldDef.nested) {
          this.validateData(value, fieldDef.nested);
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          throw new Error(`Field '${fieldName}' must be an array`);
        }
        if (fieldDef.min !== undefined && value.length < fieldDef.min) {
          throw new Error(`Field '${fieldName}' array length ${value.length} is below minimum ${fieldDef.min}`);
        }
        if (fieldDef.max !== undefined && value.length > fieldDef.max) {
          throw new Error(`Field '${fieldName}' array length ${value.length} is above maximum ${fieldDef.max}`);
        }
        if (fieldDef.nested) {
          for (let i = 0; i < value.length; i++) {
            try {
              this.validateData(value[i], fieldDef.nested);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
              throw new Error(`Field '${fieldName}' array item ${i}: ${errorMessage}`);
            }
          }
        }
        break;
    }
  }

  /**
   * Validate a constraint definition
   */
  private validateConstraint(constraint: Constraint, fields: Record<string, FieldDefinition>): void {
    if (!constraint || typeof constraint !== 'object') {
      throw new Error('Constraint must be an object');
    }

    if (!constraint.field || typeof constraint.field !== 'string') {
      throw new Error('Constraint must have a field name');
    }

    if (!fields[constraint.field]) {
      throw new Error(`Constraint references unknown field '${constraint.field}'`);
    }

    const validTypes = ['unique', 'range', 'pattern', 'custom'];
    if (!validTypes.includes(constraint.type)) {
      throw new Error(`Invalid constraint type '${constraint.type}'`);
    }

    if (constraint.type === 'custom' && typeof constraint.validator !== 'function') {
      throw new Error('Custom constraint must have a validator function');
    }
  }

  /**
   * Validate constraint against data
   */
  private validateConstraintAgainstData(constraint: Constraint, data: any): void {
    const fieldValue = data[constraint.field];

    switch (constraint.type) {
      case 'range':
        if (constraint.value && Array.isArray(constraint.value) && constraint.value.length === 2) {
          const [min, max] = constraint.value;
          if (fieldValue < min || fieldValue > max) {
            throw new Error(`Field '${constraint.field}' value must be between ${min} and ${max}`);
          }
        }
        break;

      case 'pattern':
        if (constraint.value instanceof RegExp && typeof fieldValue === 'string') {
          if (!constraint.value.test(fieldValue)) {
            throw new Error(`Field '${constraint.field}' value does not match required pattern`);
          }
        }
        break;

      case 'custom':
        if (constraint.validator && !constraint.validator(fieldValue)) {
          throw new Error(`Field '${constraint.field}' failed custom validation`);
        }
        break;

      // 'unique' constraint would need to be validated at the world level
      case 'unique':
        // This would require access to all entities with this component
        // Implementation would be in the World class
        break;
    }
  }

  /**
   * Estimate object size in bytes (rough approximation)
   */
  private getObjectSize(obj: any): number {
    const jsonString = JSON.stringify(obj);
    return new Blob([jsonString]).size;
  }
} 