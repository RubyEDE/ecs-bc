import express from 'express';
import { World } from '../src/core/world';
import { componentRegistry } from '../src/core/component';
import { SystemPriority } from '../src/core/system';
import { deploymentTracker, SystemDeploymentInfo } from './deployment-tracker';
import { initializeMonitor, getMonitor } from './deployment-monitor';
import { initializeFunctionExecutor, getFunctionExecutor } from './function-executor';
import { componentNameResolver } from './component-name-resolver';
import { enhancedSourceParser } from './enhanced-source-parser';
import { simpleQueryBuilder } from './simple-query-builder';

/**
 * ECS System API Server
 * Provides REST endpoints for deploying and managing user-defined ECS systems
 */

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Create ECS World instance with security configuration
const world = new World({
  security: {
    maxSourceLength: 50000, // 50KB limit for source code
  },
  vmTimeout: 10000, // 10 second timeout for system execution
});

// Initialize services
const deploymentMonitor = initializeMonitor(world);
const functionExecutor = initializeFunctionExecutor(world);

// Update simple query builder with the actual world instance
simpleQueryBuilder['world'] = world;

// CORS middleware - allow all origins
app.use((req: any, res: any, next: any) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Basic middleware
app.use(express.json({ limit: '1mb' }));

// Health check endpoint
app.get('/health', (req: any, res: any) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    components: ['Position', 'Velocity', 'Health'],
    systems: world.getAllLoadedSystems().length
  });
});

// Deploy a new TypeScript system with enhanced tracking
app.post('/api/systems/deploy', (req: any, res: any) => {
  try {
    const { source } = req.body;
    
    if (!source || typeof source !== 'string') {
      return res.status(400).json({ 
        error: 'Missing or invalid source code',
        message: 'Request body must contain a "source" field with TypeScript code'
      });
    }
    
    console.log('🚀 Deploying new system...');
    
    // Load the system
    const systemId = world.loadSystemFromSource(source, SystemPriority.USER);
    
    // Get the deployed system info
    const systems = world.getAllLoadedSystems();
    const deployedSystem = systems[systems.length - 1];
    
    // Use the actual system ID from the deployed system
    const actualSystemId = deployedSystem.id as number;
    
    // Start monitoring deployment
    deploymentMonitor.startMonitoring(actualSystemId);
    
    // Initialize deployment tracking
    const requiredComponents = deployedSystem.componentTypes.map((ct: any) => ct.name);
    deploymentTracker.startTracking(actualSystemId, deployedSystem.name, source, requiredComponents);
    
    // Initialize the system to capture any entities/components created during init
    try {
      world.initializeSystems();
    } catch (initError) {
      console.warn('System initialization completed with warnings:', initError);
    }
    
    // Capture deployment state
    deploymentMonitor.captureDeploymentState(actualSystemId, deployedSystem.name);
    
    // Stop monitoring
    deploymentMonitor.stopMonitoring(actualSystemId);
    
    // Get comprehensive deployment info
    const deploymentInfo = deploymentTracker.getDeploymentInfo(actualSystemId);
    
    // Enhanced parsing with new parser
    const enhancedExecutables = enhancedSourceParser.extractFunctionParameters(source);
    const componentUsage = enhancedSourceParser.findComponentUsage(source);
    const componentSchemas = enhancedSourceParser.extractComponentSchemas(source);
    
    // Build component mapping (user name -> actual unique name)
    const componentMapping: Record<string, string> = {};
    const createdComponents = deploymentInfo?.components || [];
    
    for (const comp of createdComponents) {
      // For simplicity, assume the user component name is the same as the component name
      // In a real implementation, this would be more sophisticated
      componentMapping[comp.name] = `${comp.name}_${deployedSystem.name}_${actualSystemId}`;
    }
    
    // Register component mappings with the resolver
    componentNameResolver.registerSystemComponents(actualSystemId, deployedSystem.name, componentMapping);
    
    // Get available components that this system can read
    const availableComponents = componentNameResolver.getAvailableComponents(actualSystemId);
    
    // Count entities created during deployment
    const entityCount = deploymentInfo?.entities.length || 0;
    
    console.log(`✅ System '${deployedSystem.name}' deployed successfully`);
    
    // Build enhanced response according to user requirements
    const response = {
      success: true,
      systemId: actualSystemId,
      name: deployedSystem.name,
      message: `System '${deployedSystem.name}' deployed successfully`,
      componentMapping, // user name -> actual unique name
      availableComponents: availableComponents.map(comp => comp.userDefinedName), // components this system can read
      executables: enhancedExecutables.map(exec => ({
        name: exec.name,
        parameters: exec.parameters.map(param => param.name),
        parametersDetailed: exec.parameters,
        description: exec.description,
        returnType: exec.returnType
      })),
      entityCount, // entities created during deployment
      componentUsage, // what components this system reads/writes/creates
      componentSchemas, // detailed component schemas
      requiredComponents,
      deployedAt: Date.now()
    };
    
    res.status(201).json(response);
  } catch (error) {
    console.error('❌ Deployment error:', error);
    res.status(400).json({ 
      error: 'Deployment failed', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get detailed information about a specific system
app.get('/api/systems/:id', (req: any, res: any) => {
  try {
    const systemId = parseInt(req.params.id, 10);
    
    if (isNaN(systemId)) {
      return res.status(400).json({
        error: 'Invalid system ID',
        message: 'System ID must be a valid number'
      });
    }
    
    // Get system info from world
    const systems = world.getAllLoadedSystems();
    const system = systems.find((s: any) => s.id === systemId);
    
    if (!system) {
      return res.status(404).json({
        error: 'System not found',
        message: `No system found with ID ${systemId}`
      });
    }
    
    // Get deployment info
    const deploymentInfo = deploymentTracker.getDeploymentInfo(systemId);
    
    if (!deploymentInfo) {
      return res.status(404).json({
        error: 'Deployment info not found',
        message: `No deployment information found for system ${systemId}`
      });
    }
    
    // Build detailed response
    const response = {
      success: true,
      systemId: system.id as number,
      name: system.name,
      requiredComponents: system.componentTypes.map((ct: any) => ct.name),
      executables: deploymentInfo.executables,
      components: deploymentInfo.components,
      entities: deploymentInfo.entities,
      deployedAt: deploymentInfo.deployedAt
    };
    
    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching system info:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// List all deployed systems
app.get('/api/systems', (req: any, res: any) => {
  const systems = world.getAllLoadedSystems();
  res.json({ 
    success: true, 
    count: systems.length,
    systems: systems.map((s: any) => ({ 
      name: s.name, 
      id: s.id,
      requiredComponents: s.componentTypes.map((ct: any) => ct.name)
    }))
  });
});

// Get information about available components
app.get('/api/components', (req: any, res: any) => {
  const components = componentRegistry.getAllTypes();
  res.json({
    success: true,
    count: components.length,
    components: components.map((ct: any) => ({
      id: ct.id,
      name: ct.name
    }))
  });
});

// Execute a function on a deployed system
app.post('/api/systems/:id/execute', async (req: any, res: any) => {
  try {
    const systemId = parseInt(req.params.id, 10);
    const { functionName, args = {} } = req.body;
    
    if (isNaN(systemId)) {
      return res.status(400).json({
        error: 'Invalid system ID',
        message: 'System ID must be a valid number'
      });
    }
    
    if (!functionName || typeof functionName !== 'string') {
      return res.status(400).json({
        error: 'Missing function name',
        message: 'Request body must contain a "functionName" field'
      });
    }
    
    // Get system info from world
    const systems = world.getAllLoadedSystems();
    const system = systems.find((s: any) => s.id === systemId);
    
    if (!system) {
      return res.status(404).json({
        error: 'System not found',
        message: `No system found with ID ${systemId}`
      });
    }
    
    // Get deployment info to validate the function exists
    const deploymentInfo = deploymentTracker.getDeploymentInfo(systemId);
    
    if (!deploymentInfo) {
      return res.status(404).json({
        error: 'Deployment info not found',
        message: `No deployment information found for system ${systemId}`
      });
    }
    
    // Validate that the function exists in the system's executables
    const executable = deploymentInfo.executables.find(exec => exec.name === functionName);
    
    if (!executable) {
      return res.status(404).json({
        error: 'Function not found',
        message: `Function '${functionName}' not found in system '${system.name}'`,
        availableFunctions: deploymentInfo.executables.map(exec => exec.name)
      });
    }
    
    console.log(`🎯 Executing ${functionName} on system ${system.name} with args:`, args);
    
    // Execute the function through the function executor
    try {
      const result = await functionExecutor.executeFunction(systemId, functionName, args);
      
      if (result.success) {
        console.log(`✅ Function '${functionName}' executed successfully`);
        
        res.json({
          success: true,
          systemId,
          functionName,
          result: result.result,
          gasUsed: result.gasUsed,
          executionTime: result.executionTime,
          executedAt: Date.now()
        });
      } else {
        console.error(`❌ Function execution failed:`, result.error);
        res.status(500).json({
          error: 'Function execution failed',
          message: result.error,
          functionName,
          systemId,
          gasUsed: result.gasUsed,
          executionTime: result.executionTime
        });
      }
    } catch (executionError) {
      console.error(`❌ Function execution error:`, executionError);
      res.status(500).json({
        error: 'Function execution failed',
        message: executionError instanceof Error ? executionError.message : 'Unknown execution error',
        functionName,
        systemId
      });
    }
    
  } catch (error) {
    console.error('❌ Error in execute endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get detailed information about a specific entity
app.get('/api/entities/:id', (req: any, res: any) => {
  try {
    const entityId = parseInt(req.params.id, 10);
    
    if (isNaN(entityId)) {
      return res.status(400).json({
        error: 'Invalid entity ID',
        message: 'Entity ID must be a valid number'
      });
    }
    
    // Use the enhanced query builder to get entity details
    const entityData = simpleQueryBuilder.getEntityComponentsWithNames(entityId, -1);
    
    if (!entityData || entityData.componentSummary.totalComponents === 0) {
      return res.status(404).json({
        error: 'Entity not found',
        message: `No entity found with ID ${entityId}`
      });
    }
    
    // Build enhanced response according to user requirements
    const response = {
      success: true,
      entity: {
        id: entityData.id,
        generation: entityData.generation,
        ownedBy: entityData.ownedBy, // which system created this entity
        components: entityData.components, // components with user-friendly names
        componentSummary: entityData.componentSummary,
        actualComponentNames: entityData.actualComponentNames // mapping to actual unique names
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching entity info:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all entities with optional filtering using enhanced query builder
app.get('/api/entities', (req: any, res: any) => {
  try {
    const { component, owner, limit = 50, offset = 0 } = req.query;
    
    // Build query using the enhanced query builder
    const query = {
      hasComponents: component ? [component] : [],
      systemId: owner ? parseInt(owner, 10) : undefined,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0
    };
    
    const result = simpleQueryBuilder.getAllEntitiesWithDetails(-1, query.limit, query.offset);
    
    // Filter by component if specified
    let filteredEntities = result.entities;
    if (component) {
      filteredEntities = result.entities.filter(entity => 
        Object.keys(entity.components).includes(component)
      );
    }
    
    // Filter by owner if specified
    if (owner) {
      const ownerSystemId = parseInt(owner, 10);
      filteredEntities = filteredEntities.filter(entity => 
        entity.ownedBy === ownerSystemId
      );
    }
    
    const response = {
      success: true,
      count: filteredEntities.length,
      entities: filteredEntities.map(entity => ({
        id: entity.id,
        generation: entity.generation,
        ownedBy: entity.ownedBy,
        componentTypes: Object.keys(entity.components),
        components: entity.components,
        componentSummary: entity.componentSummary,
        isAlive: true
      })),
      pagination: {
        total: filteredEntities.length,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < filteredEntities.length
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching entities:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Enhanced entity query endpoint with name resolution
app.post('/api/entities/query', async (req: any, res: any) => {
  try {
    const { 
      hasComponents = [], 
      systemId,
      limit = 50, 
      offset = 0 
    } = req.body;
    
    // Use the enhanced query builder with component name resolution
    const result = await simpleQueryBuilder.queryEntities({
      hasComponents,
      systemId,
      limit,
      offset
    });
    
    if (!result.success) {
      return res.status(500).json({
        error: 'Query failed',
        message: 'Failed to execute entity query'
      });
    }
    
    // Build response according to user requirements
    const response = {
      success: true,
      entities: result.entities.map(entity => ({
        id: entity.id,
        components: entity.components, // Show as user names
        actualComponentNames: entity.actualComponentNames, // mapping to actual names
        ownedBy: entity.ownedBy,
        componentSummary: entity.componentSummary
      })),
      totalFound: result.totalFound,
      query: {
        hasComponents,
        systemId
      },
      pagination: {
        total: result.totalFound,
        limit,
        offset,
        hasMore: offset + limit < result.totalFound
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('❌ Error querying entities:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// NEW ENDPOINT: System component overview
app.get('/api/systems/:id/components', (req: any, res: any) => {
  try {
    const systemId = parseInt(req.params.id, 10);
    
    if (isNaN(systemId)) {
      return res.status(400).json({
        error: 'Invalid system ID',
        message: 'System ID must be a valid number'
      });
    }
    
    // Get system info from world
    const systems = world.getAllLoadedSystems();
    const system = systems.find((s: any) => s.id === systemId);
    
    if (!system) {
      return res.status(404).json({
        error: 'System not found',
        message: `No system found with ID ${systemId}`
      });
    }
    
    // Get deployment info for this system
    const deploymentInfo = deploymentTracker.getDeploymentInfo(systemId);
    
    if (!deploymentInfo) {
      return res.status(404).json({
        error: 'Deployment info not found',
        message: `No deployment information found for system ${systemId}`
      });
    }
    
    // Get owned components (components this system created)
    const ownedComponents = deploymentInfo.components.map(componentDef => {
      const entityCount = simpleQueryBuilder.countEntitiesWithComponents(systemId, [componentDef.name]);
      
      return {
        userDefinedName: componentDef.name,
        actualName: `${componentDef.name}_${system.name}_${systemId}`,
        entityCount,
        schema: componentDef.schema
      };
    });
    
    // Get readable components (components this system can access)
    const availableComponents = componentNameResolver.getAvailableComponents(systemId);
    const readableComponents = availableComponents
      .filter(comp => comp.systemId !== systemId) // Exclude own components
      .map(comp => ({
        userDefinedName: comp.userDefinedName,
        actualName: comp.actualName,
        owner: comp.systemName,
        entityCount: 0 // Would need to count across all entities
      }));
    
    // Response according to user requirements
    const response = {
      success: true,
      systemId,
      components: {
        owned: ownedComponents,
        readable: readableComponents,
        writable: [] // Could be extended to track writable components
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching system components:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// NEW ENDPOINT: Component name resolution
app.get('/api/components/resolve/:systemId/:componentName', (req: any, res: any) => {
  try {
    const systemId = parseInt(req.params.systemId, 10);
    const componentName = req.params.componentName;
    
    if (isNaN(systemId)) {
      return res.status(400).json({
        error: 'Invalid system ID',
        message: 'System ID must be a valid number'
      });
    }
    
    if (!componentName) {
      return res.status(400).json({
        error: 'Missing component name',
        message: 'Component name is required'
      });
    }
    
    // Try to resolve the component name
    const actualName = componentNameResolver.resolveComponentName(systemId, componentName);
    
    if (!actualName) {
      return res.status(404).json({
        error: 'Component not found',
        message: `Component '${componentName}' not found for system ${systemId}`
      });
    }
    
    // Get additional component info if available
    const deploymentInfo = deploymentTracker.getDeploymentInfo(systemId);
    const componentDef = deploymentInfo?.components.find(c => c.name === componentName);
    
    const response = {
      success: true,
      userDefinedName: componentName,
      actualName,
      systemId,
      schema: componentDef?.schema,
      entityCount: simpleQueryBuilder.countEntitiesWithComponents(systemId, [componentName])
    };
    
    res.json(response);
  } catch (error) {
    console.error('❌ Error resolving component name:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// NEW ENDPOINT: Simple component-based entity search
app.get('/api/entities/by-components', (req: any, res: any) => {
  try {
    const { components, systemId, limit = 20, offset = 0 } = req.query;
    
    if (!components) {
      return res.status(400).json({
        error: 'Missing components parameter',
        message: 'At least one component name must be specified'
      });
    }
    
    // Parse components parameter (can be comma-separated string or array)
    const componentNames = Array.isArray(components) 
      ? components 
      : components.split(',').map((c: string) => c.trim());
    
    const requestingSystemId = systemId ? parseInt(systemId, 10) : -1;
    
    // Use the query builder to find entities
    const entities = simpleQueryBuilder.queryByUserComponentNames(requestingSystemId, componentNames);
    
    // Apply pagination
    const limitNum = parseInt(limit, 10) || 20;
    const offsetNum = parseInt(offset, 10) || 0;
    const paginatedEntities = entities.slice(offsetNum, offsetNum + limitNum);
    
    const response = {
      success: true,
      entities: paginatedEntities.map(entity => ({
        id: entity.id,
        components: Object.fromEntries(
          componentNames.map((name: string) => [name, entity.components[name]])
            .filter(([_, value]: [string, any]) => value !== undefined)
        ),
        ownedBy: entity.ownedBy,
        componentSummary: entity.componentSummary
      })),
      totalFound: entities.length,
      searchedComponents: componentNames,
      pagination: {
        total: entities.length,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < entities.length
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('❌ Error searching entities by components:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 ECS System API Server running on port ${port}`);
  console.log(`🌐 Server endpoints:`);
  console.log(`  GET  http://localhost:${port}/health`);
  console.log(`  POST http://localhost:${port}/api/systems/deploy`);
  console.log(`  GET  http://localhost:${port}/api/systems`);
  console.log(`  GET  http://localhost:${port}/api/systems/:id`);
  console.log(`  GET  http://localhost:${port}/api/systems/:id/components`);
  console.log(`  POST http://localhost:${port}/api/systems/:id/execute`);
  console.log(`  GET  http://localhost:${port}/api/entities`);
  console.log(`  GET  http://localhost:${port}/api/entities/:id`);
  console.log(`  GET  http://localhost:${port}/api/entities/by-components`);
  console.log(`  POST http://localhost:${port}/api/entities/query`);
  console.log(`  GET  http://localhost:${port}/api/components`);
  console.log(`  GET  http://localhost:${port}/api/components/resolve/:systemId/:componentName`);
  console.log(`📚 Enhanced ECS Server with IDE support - Ready for deployment!`);
}); 