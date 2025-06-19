import { ComponentType } from './component';

/**
 * Component ownership and registration information
 */
export interface ComponentRegistration {
  componentType: ComponentType;
  originalName: string;
  uniqueName: string;
  ownerSystemId: string;
  systemUniqueId: string;
  createdAt: number;
  accessPermissions: ComponentAccessPermissions;
}

/**
 * Access permissions for components
 */
export interface ComponentAccessPermissions {
  read: string[]; // System IDs that can read
  write: string[]; // System IDs that can write (owner is always included)
  readAll: boolean; // If true, all systems can read
}

/**
 * Access attempt result
 */
export interface AccessAttemptResult {
  allowed: boolean;
  reason?: string;
  suggestedAction?: string;
}

/**
 * Enhanced component registry with ownership and access control
 */
export class EnhancedComponentRegistry {
  private componentsByName = new Map<string, ComponentRegistration>();
  private componentsByUniqueId = new Map<number, ComponentRegistration>();
  private componentsBySystemId = new Map<string, ComponentRegistration[]>();
  private systemUniqueIds = new Map<string, string>();
  private systemIdCounter = 1;
  private accessLog: ComponentAccessLog[] = [];

  /**
   * Generate a unique system identifier
   */
  private generateSystemUniqueId(systemName: string): string {
    const existingId = this.systemUniqueIds.get(systemName);
    if (existingId) {
      return existingId;
    }

    const paddedId = this.systemIdCounter.toString().padStart(3, '0');
    const uniqueId = `SYS${paddedId}`;
    this.systemIdCounter++;
    
    this.systemUniqueIds.set(systemName, uniqueId);
    return uniqueId;
  }

  /**
   * Generate unique component name
   */
  private generateUniqueComponentName(originalName: string, systemUniqueId: string): string {
    return `${originalName}_${systemUniqueId}`;
  }

  /**
   * Register a component with ownership
   */
  registerComponent<T>(
    originalName: string,
    constructor: new (...args: any[]) => T,
    ownerSystemId: string,
    accessPermissions?: Partial<ComponentAccessPermissions>
  ): ComponentType<T> {
    // Generate unique system ID if not exists
    const systemUniqueId = this.generateSystemUniqueId(ownerSystemId);
    const uniqueName = this.generateUniqueComponentName(originalName, systemUniqueId);

    // Check if unique name already exists (shouldn't happen, but safety check)
    if (this.componentsByName.has(uniqueName)) {
      throw new Error(`Component with unique name '${uniqueName}' already exists`);
    }

    // Create component type with unique name
    const componentType: ComponentType<T> = {
      id: this.componentsByUniqueId.size,
      name: uniqueName,
      constructor
    };

    // Default access permissions - owner can read/write, others can read
    const defaultPermissions: ComponentAccessPermissions = {
      read: [],
      write: [ownerSystemId],
      readAll: true // By default, allow all systems to read
    };

    const finalPermissions = {
      ...defaultPermissions,
      ...accessPermissions
    };

    // Ensure owner always has write access
    if (!finalPermissions.write.includes(ownerSystemId)) {
      finalPermissions.write.push(ownerSystemId);
    }

    const registration: ComponentRegistration = {
      componentType,
      originalName,
      uniqueName,
      ownerSystemId,
      systemUniqueId,
      createdAt: Date.now(),
      accessPermissions: finalPermissions
    };

    // Store registration
    this.componentsByName.set(uniqueName, registration);
    this.componentsByUniqueId.set(componentType.id, registration);
    
    // Track by system
    if (!this.componentsBySystemId.has(ownerSystemId)) {
      this.componentsBySystemId.set(ownerSystemId, []);
    }
    this.componentsBySystemId.get(ownerSystemId)!.push(registration);

    return componentType;
  }

  /**
   * Get component type by original name and requesting system
   * This allows systems to reference components by their original name
   */
  getComponentByOriginalName(originalName: string, requestingSystemId: string): ComponentType | undefined {
    // First, check if the requesting system owns a component with this name
    const ownedComponents = this.componentsBySystemId.get(requestingSystemId) || [];
    const ownedComponent = ownedComponents.find(reg => reg.originalName === originalName);
    if (ownedComponent) {
      return ownedComponent.componentType;
    }

    // Then, find any component with this original name that allows read access
    for (const registration of this.componentsByName.values()) {
      if (registration.originalName === originalName) {
        const accessResult = this.checkReadAccess(registration, requestingSystemId);
        if (accessResult.allowed) {
          return registration.componentType;
        }
      }
    }

    return undefined;
  }

  /**
   * Get component registration by unique name
   */
  getComponentByUniqueName(uniqueName: string): ComponentRegistration | undefined {
    return this.componentsByName.get(uniqueName);
  }

  /**
   * Check if a system can read a component
   */
  checkReadAccess(registration: ComponentRegistration, requestingSystemId: string): AccessAttemptResult {
    const { accessPermissions, ownerSystemId } = registration;

    // Owner always has read access
    if (requestingSystemId === ownerSystemId) {
      return { allowed: true };
    }

    // Check if read access is granted to all
    if (accessPermissions.readAll) {
      return { allowed: true };
    }

    // Check explicit read permissions
    if (accessPermissions.read.includes(requestingSystemId)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `System '${requestingSystemId}' does not have read access to component '${registration.originalName}' owned by '${ownerSystemId}'`,
      suggestedAction: `Request read access from owner system or use a different component`
    };
  }

  /**
   * Check if a system can write to a component
   */
  checkWriteAccess(registration: ComponentRegistration, requestingSystemId: string): AccessAttemptResult {
    const { accessPermissions, ownerSystemId } = registration;

    // Check explicit write permissions
    if (accessPermissions.write.includes(requestingSystemId)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `System '${requestingSystemId}' does not have write access to component '${registration.originalName}' owned by '${ownerSystemId}'`,
      suggestedAction: `Only the owner system can modify this component`
    };
  }

  /**
   * Grant read access to a system
   */
  grantReadAccess(componentUniqueName: string, targetSystemId: string, grantingSystemId: string): boolean {
    const registration = this.componentsByName.get(componentUniqueName);
    if (!registration) {
      throw new Error(`Component '${componentUniqueName}' not found`);
    }

    // Only owner can grant access
    if (registration.ownerSystemId !== grantingSystemId) {
      throw new Error(`Only owner system '${registration.ownerSystemId}' can grant access`);
    }

    if (!registration.accessPermissions.read.includes(targetSystemId)) {
      registration.accessPermissions.read.push(targetSystemId);
    }

    this.logAccess('GRANT_READ', grantingSystemId, registration, targetSystemId);
    return true;
  }

  /**
   * Grant write access to a system
   */
  grantWriteAccess(componentUniqueName: string, targetSystemId: string, grantingSystemId: string): boolean {
    const registration = this.componentsByName.get(componentUniqueName);
    if (!registration) {
      throw new Error(`Component '${componentUniqueName}' not found`);
    }

    // Only owner can grant access
    if (registration.ownerSystemId !== grantingSystemId) {
      throw new Error(`Only owner system '${registration.ownerSystemId}' can grant access`);
    }

    if (!registration.accessPermissions.write.includes(targetSystemId)) {
      registration.accessPermissions.write.push(targetSystemId);
    }

    this.logAccess('GRANT_WRITE', grantingSystemId, registration, targetSystemId);
    return true;
  }

  /**
   * Get all components owned by a system
   */
  getSystemComponents(systemId: string): ComponentRegistration[] {
    return this.componentsBySystemId.get(systemId) || [];
  }

  /**
   * Get system unique ID
   */
  getSystemUniqueId(systemName: string): string | undefined {
    return this.systemUniqueIds.get(systemName);
  }

  /**
   * Log access attempts for debugging
   */
  private logAccess(operation: string, systemId: string, registration: ComponentRegistration, targetSystemId?: string): void {
    this.accessLog.push({
      timestamp: Date.now(),
      operation,
      systemId,
      componentName: registration.originalName,
      componentUniqueName: registration.uniqueName,
      targetSystemId,
      success: true
    });

    // Keep only last 1000 log entries
    if (this.accessLog.length > 1000) {
      this.accessLog.shift();
    }
  }

  /**
   * Get access log for debugging
   */
  getAccessLog(): ComponentAccessLog[] {
    return [...this.accessLog];
  }

  /**
   * Clear access log
   */
  clearAccessLog(): void {
    this.accessLog = [];
  }

  /**
   * Get registry statistics
   */
  getStats() {
    return {
      totalComponents: this.componentsByName.size,
      totalSystems: this.systemUniqueIds.size,
      accessLogEntries: this.accessLog.length,
      componentsBySystem: Object.fromEntries(
        Array.from(this.componentsBySystemId.entries()).map(([systemId, components]) => [
          systemId,
          components.length
        ])
      )
    };
  }
}

/**
 * Access log entry interface
 */
interface ComponentAccessLog {
  timestamp: number;
  operation: string;
  systemId: string;
  componentName: string;
  componentUniqueName: string;
  targetSystemId?: string;
  success: boolean;
}

/**
 * Global enhanced component registry instance
 */
export const enhancedComponentRegistry = new EnhancedComponentRegistry(); 