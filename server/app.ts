import express from 'express';
import { World } from '../src/core/world';
import { componentRegistry } from '../src/core/component';
import { SystemPriority } from '../src/core/system';

/**
 * ECS System API Server
 * Provides REST endpoints for deploying and managing user-defined ECS systems
 */

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Register basic components that users can use in their systems
const PositionComponent = componentRegistry.register('Position', class {
  constructor(public x: number = 0, public y: number = 0) {}
});

const VelocityComponent = componentRegistry.register('Velocity', class {
  constructor(public dx: number = 0, public dy: number = 0) {}
});

const HealthComponent = componentRegistry.register('Health', class {
  constructor(public current: number = 100, public max: number = 100) {}
});

// Create ECS World instance with security configuration
const world = new World({
  security: {
    maxSourceLength: 50000, // 50KB limit for source code
  },
  vmTimeout: 10000, // 10 second timeout for system execution
});

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

// Deploy a new TypeScript system
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
    const systemId = world.loadSystemFromSource(source, SystemPriority.USER);
    
    // Get the deployed system info
    const systems = world.getAllLoadedSystems();
    const deployedSystem = systems[systems.length - 1];
    
    console.log(`✅ System '${deployedSystem.name}' deployed successfully`);
    
    res.status(201).json({ 
      success: true, 
      systemId,
      name: deployedSystem.name,
      message: `System '${deployedSystem.name}' deployed successfully`,
      requiredComponents: deployedSystem.componentTypes.map((ct: any) => ct.name)
    });
  } catch (error) {
    console.error('❌ Deployment error:', error);
    res.status(400).json({ 
      error: 'Deployment failed', 
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

// Start server
app.listen(port, () => {
  console.log(`🚀 ECS System API Server running on port ${port}`);
  console.log(`📦 Registered components: ${[PositionComponent.name, VelocityComponent.name, HealthComponent.name].join(', ')}`);
  console.log(`🌐 Server endpoints:`);
  console.log(`  GET  http://localhost:${port}/health`);
  console.log(`  POST http://localhost:${port}/api/systems/deploy`);
  console.log(`  GET  http://localhost:${port}/api/systems`);
  console.log(`  GET  http://localhost:${port}/api/components`);
  console.log(`📚 Ready for system deployment!`);
}); 