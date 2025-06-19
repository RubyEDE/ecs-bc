import { SystemId } from './deployment-tracker';
import { componentRegistry } from '../src/core/component';

/**
 * Information about a component's accessibility
 */
export interface ComponentAccess {
  userDefinedName: string;
  actualName: string;
  systemId: SystemId;
  systemName: string;
  entityCount?: number;
  schema?: any;
}

/**
 * Component usage information
 */
export interface ComponentUsage {
  reads: string[];      // Components that the system reads from
  writes: string[];     // Components that the system modifies  
  creates: string[];    // Components that the system creates
}

/**
 * Service for resolving component names between user-defined names and actual unique names
 */
export class ComponentNameResolver {
  private systemComponentMap = new Map<SystemId, Map<string, string>>(); // systemId -> userComponentName -> actualComponentName
  private reverseComponentMap = new Map<SystemId, Map<string, string>>(); // systemId -> actualComponentName -> userComponentName
  private componentAccessMap = new Map<SystemId, ComponentAccess[]>(); // systemId -> accessible components

  /**
   * Register component mappings for a system
   */
  registerSystemComponents(systemId: SystemId, systemName: string, componentMappings: Record<string, string>): void {
    const userToActual = new Map<string, string>();
    const actualToUser = new Map<string, string>();

    for (const [userComponentName, actualComponentName] of Object.entries(componentMappings)) {
      userToActual.set(userComponentName, actualComponentName);
      actualToUser.set(actualComponentName, userComponentName);
    }

    this.systemComponentMap.set(systemId, userToActual);
    this.reverseComponentMap.set(systemId, actualToUser);

    // Build accessible components list
    const accessibleComponents: ComponentAccess[] = [];
    
    for (const [userComponentName, actualComponentName] of Object.entries(componentMappings)) {
      accessibleComponents.push({
        userDefinedName: userComponentName,
        actualName: actualComponentName,
        systemId,
        systemName,
        entityCount: 0 // Will be updated when needed
      });
    }

    this.componentAccessMap.set(systemId, accessibleComponents);
  }

  /**
   * Resolve user component name to actual unique name
   */
  resolveComponentName(systemId: SystemId, userComponentName: string): string | null {
    const systemMap = this.systemComponentMap.get(systemId);
    if (!systemMap) return null;
    
    return systemMap.get(userComponentName) || null;
  }

  /**
   * Get all component names a system can access
   */
  getAccessibleComponents(systemId: SystemId): ComponentAccess[] {
    return this.componentAccessMap.get(systemId) || [];
  }

  /**
   * Reverse lookup: actual name to user name
   */
  getUserComponentName(systemId: SystemId, actualComponentName: string): string | null {
    const reverseMap = this.reverseComponentMap.get(systemId);
    if (!reverseMap) return null;
    
    return reverseMap.get(actualComponentName) || null;
  }

  /**
   * Get component mapping for a system (for enhanced deployment response)
   */
  getComponentMapping(systemId: SystemId): Record<string, string> {
    const systemMap = this.systemComponentMap.get(systemId);
    if (!systemMap) return {};
    
    const mapping: Record<string, string> = {};
    for (const [userComponentName, actualComponentName] of systemMap.entries()) {
      mapping[userComponentName] = actualComponentName;
    }
    return mapping;
  }

  /**
   * Get components that other systems have made available to read
   */
  getAvailableComponents(requestingSystemId: SystemId): ComponentAccess[] {
    const availableComponents: ComponentAccess[] = [];
    
    // Get all components from the static registry
    const allComponentTypes = componentRegistry.getAllTypes();
    for (const componentType of allComponentTypes) {
      availableComponents.push({
        userDefinedName: componentType.name,
        actualName: componentType.name,
        systemId: -1, // Built-in component
        systemName: 'Built-in',
        entityCount: 0
      });
    }

    // Get components from other deployed systems
    for (const [systemId, accessList] of this.componentAccessMap.entries()) {
      if (systemId !== requestingSystemId) {
        availableComponents.push(...accessList);
      }
    }

    return availableComponents;
  }

  /**
   * Resolve multiple component names at once
   */
  resolveComponentNames(systemId: SystemId, userComponentNames: string[]): Record<string, string> {
    const resolved: Record<string, string> = {};
    
    for (const userComponentName of userComponentNames) {
      const actualName = this.resolveComponentName(systemId, userComponentName);
      if (actualName) {
        resolved[userComponentName] = actualName;
      }
    }
    
    return resolved;
  }

  /**
   * Check if a system has access to a component (by user name)
   */
  hasComponentAccess(systemId: SystemId, userComponentName: string): boolean {
    return this.resolveComponentName(systemId, userComponentName) !== null;
  }

  /**
   * Remove component mappings for a system (when system is unloaded)
   */
  unregisterSystemComponents(systemId: SystemId): void {
    this.systemComponentMap.delete(systemId);
    this.reverseComponentMap.delete(systemId);
    this.componentAccessMap.delete(systemId);
  }

  /**
   * Get all systems that have registered components
   */
  getAllRegisteredSystems(): SystemId[] {
    return Array.from(this.systemComponentMap.keys());
  }
}

// Global instance
export const componentNameResolver = new ComponentNameResolver(); 