import { World } from '../src/core/world';
import { componentRegistry } from '../src/core/component';
import { SystemId, deploymentTracker } from './deployment-tracker';
import { componentNameResolver } from './component-name-resolver';

/**
 * Enhanced entity data with resolved component names
 */
export interface EnhancedEntityData {
  id: number;
  generation: number;
  ownedBy?: SystemId;
  components: Record<string, any>;
  componentSummary: {
    totalComponents: number;
    systemOwners: SystemId[];
    readableBy: SystemId[];
  };
  actualComponentNames?: Record<string, string>;
}

/**
 * Query parameters for entity search
 */
export interface EntityQuery {
  hasComponents?: string[];     // User component names
  systemId?: SystemId;         // Filter by system ownership
  limit?: number;
  offset?: number;
}

/**
 * Query result with enhanced entity information
 */
export interface QueryResult {
  success: boolean;
  entities: EnhancedEntityData[];
  totalFound: number;
  query: EntityQuery;
}

/**
 * Simple query builder for component-based entity searches
 */
export class SimpleQueryBuilder {
  constructor(private world: World) {}

  /**
   * Query entities by user component names with name resolution
   */
  queryByUserComponentNames(systemId: SystemId, componentNames: string[]): EnhancedEntityData[] {
    const matchingEntities: EnhancedEntityData[] = [];
    
    try {
      // Resolve component names to actual names
      const resolvedComponents: Record<string, string> = {};
      for (const userComponentName of componentNames) {
        const actualName = componentNameResolver.resolveComponentName(systemId, userComponentName);
        if (actualName) {
          resolvedComponents[userComponentName] = actualName;
        } else {
          // Try to find in static registry
          const staticComponent = componentRegistry.getAllTypes().find(ct => ct.name === userComponentName);
          if (staticComponent) {
            resolvedComponents[userComponentName] = staticComponent.name;
          }
        }
      }

      // Get all entities
      const allEntities = this.world.getAllEntities();
      
      for (const entity of allEntities) {
        const entityComponents = this.getEntityComponentsWithNames(entity.id, systemId);
        
        // Check if entity has all required components
        let hasAllComponents = true;
        for (const userComponentName of componentNames) {
          const actualName = resolvedComponents[userComponentName];
          if (!actualName || !entityComponents.components[userComponentName]) {
            hasAllComponents = false;
            break;
          }
        }
        
        if (hasAllComponents) {
          matchingEntities.push(entityComponents);
        }
      }
      
    } catch (error) {
      console.warn('Error in queryByUserComponentNames:', error);
    }
    
    return matchingEntities;
  }

  /**
   * Get entity components with name resolution and ownership info
   */
  getEntityComponentsWithNames(entityId: number, requestingSystemId: SystemId): EnhancedEntityData {
    // Create entity object for lookup
    const entity = { id: entityId, generation: 1 }; // Simplified for this demo
    
    // Find the actual entity to get correct generation
    const allEntities = this.world.getAllEntities();
    const actualEntity = allEntities.find(e => e.id === entityId);
    
    if (!actualEntity) {
      return {
        id: entityId,
        generation: 1,
        components: {},
        componentSummary: {
          totalComponents: 0,
          systemOwners: [],
          readableBy: []
        }
      };
    }

    const components: Record<string, any> = {};
    const actualComponentNames: Record<string, string> = {};
    const systemOwners: Set<SystemId> = new Set();
    const readableBy: Set<SystemId> = new Set();

    // Get components from static registry
    const allComponentTypes = componentRegistry.getAllTypes();
    for (const componentType of allComponentTypes) {
      const component = this.world.getComponent(actualEntity, componentType);
      if (component) {
        const userComponentName = componentNameResolver.getUserComponentName(requestingSystemId, componentType.name) || componentType.name;
        components[userComponentName] = component;
        actualComponentNames[userComponentName] = componentType.name;
        
        // Built-in components are readable by all systems
        readableBy.add(-1); // Built-in system marker
      }
    }

    // Get components from deployment tracking
    const deploymentInfos = deploymentTracker.getAllDeploymentInfo();
    for (const deploymentInfo of deploymentInfos) {
      for (const componentDef of deploymentInfo.components) {
        // Create temporary component type
        const tempComponentType = {
          id: componentDef.version + 50,
          name: componentDef.name,
          constructor: class TempComponent {
            constructor(compData: any = {}) {
              Object.assign(this, compData);
            }
          }
        };

        try {
          const component = this.world.getComponent(actualEntity, tempComponentType as any);
          if (component) {
            const userComponentName = componentNameResolver.getUserComponentName(deploymentInfo.systemId, componentDef.name) || componentDef.name;
            
            // Only add if not already added
            if (!components[userComponentName]) {
              components[userComponentName] = component;
              actualComponentNames[userComponentName] = componentDef.name;
              systemOwners.add(deploymentInfo.systemId);
              readableBy.add(deploymentInfo.systemId);
            }
          }
        } catch (error) {
          // Ignore errors when checking for components
        }
      }
    }

    // Find entity ownership
    let ownedBy: SystemId | undefined;
    for (const deploymentInfo of deploymentInfos) {
      const entityInfo = deploymentInfo.entities.find(e => e.entityId === entityId);
      if (entityInfo) {
        ownedBy = deploymentInfo.systemId;
        break;
      }
    }

    return {
      id: actualEntity.id,
      generation: actualEntity.generation,
      ownedBy,
      components,
      actualComponentNames,
      componentSummary: {
        totalComponents: Object.keys(components).length,
        systemOwners: Array.from(systemOwners),
        readableBy: Array.from(readableBy)
      }
    };
  }

  /**
   * Enhanced entity query with name resolution
   */
  async queryEntities(query: EntityQuery): Promise<QueryResult> {
    try {
      const { hasComponents = [], systemId, limit = 50, offset = 0 } = query;
      
      let matchingEntities: EnhancedEntityData[] = [];
      
      if (hasComponents.length > 0 && systemId !== undefined) {
        // Use component-based search with name resolution
        matchingEntities = this.queryByUserComponentNames(systemId, hasComponents);
      } else {
        // Get all entities and filter
        const allEntities = this.world.getAllEntities();
        
        for (const entity of allEntities) {
          const entityData = this.getEntityComponentsWithNames(entity.id, systemId || -1);
          
          // Filter by system ownership if specified
          if (systemId !== undefined && entityData.ownedBy !== systemId) {
            continue;
          }
          
          // Filter by required components if specified
          if (hasComponents.length > 0) {
            let hasAllComponents = true;
            for (const componentName of hasComponents) {
              if (!entityData.components[componentName]) {
                hasAllComponents = false;
                break;
              }
            }
            if (!hasAllComponents) {
              continue;
            }
          }
          
          matchingEntities.push(entityData);
        }
      }
      
      // Apply pagination
      const totalFound = matchingEntities.length;
      const paginatedEntities = matchingEntities.slice(offset, offset + limit);
      
      return {
        success: true,
        entities: paginatedEntities,
        totalFound,
        query
      };
      
    } catch (error) {
      console.warn('Error in queryEntities:', error);
      return {
        success: false,
        entities: [],
        totalFound: 0,
        query
      };
    }
  }

  /**
   * Get all entities with detailed component information
   */
  getAllEntitiesWithDetails(requestingSystemId: SystemId = -1, limit: number = 50, offset: number = 0): QueryResult {
    try {
      const allEntities = this.world.getAllEntities();
      const detailedEntities: EnhancedEntityData[] = [];
      
      for (const entity of allEntities) {
        const entityData = this.getEntityComponentsWithNames(entity.id, requestingSystemId);
        detailedEntities.push(entityData);
      }
      
      // Apply pagination
      const totalFound = detailedEntities.length;
      const paginatedEntities = detailedEntities.slice(offset, offset + limit);
      
      return {
        success: true,
        entities: paginatedEntities,
        totalFound,
        query: { limit, offset }
      };
      
    } catch (error) {
      console.warn('Error in getAllEntitiesWithDetails:', error);
      return {
        success: false,
        entities: [],
        totalFound: 0,
        query: { limit, offset }
      };
    }
  }

  /**
   * Find entities owned by a specific system
   */
  getEntitiesBySystem(systemId: SystemId, limit: number = 50, offset: number = 0): QueryResult {
    return this.getAllEntitiesWithDetails(systemId, limit, offset);
  }

  /**
   * Count entities with specific components
   */
  countEntitiesWithComponents(systemId: SystemId, componentNames: string[]): number {
    try {
      const entities = this.queryByUserComponentNames(systemId, componentNames);
      return entities.length;
    } catch (error) {
      console.warn('Error counting entities with components:', error);
      return 0;
    }
  }
}

// Global instance - will be updated with correct world instance in app.ts
export const simpleQueryBuilder = new SimpleQueryBuilder(new World()); 