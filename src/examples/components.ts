import { componentRegistry } from '../core/component';

/**
 * Position component for 2D coordinates
 */
export class Position {
  constructor(public x: number = 0, public y: number = 0) {}
  
  toString(): string {
    return `Position(${this.x}, ${this.y})`;
  }
}

/**
 * Velocity component for 2D movement
 */
export class Velocity {
  constructor(public x: number = 0, public y: number = 0) {}
  
  toString(): string {
    return `Velocity(${this.x}, ${this.y})`;
  }
}

/**
 * Health component for entities
 */
export class Health {
  constructor(
    public current: number = 100,
    public maximum: number = 100
  ) {}
  
  isDead(): boolean {
    return this.current <= 0;
  }
  
  isFullHealth(): boolean {
    return this.current >= this.maximum;
  }
  
  takeDamage(damage: number): void {
    this.current = Math.max(0, this.current - damage);
  }
  
  heal(amount: number): void {
    this.current = Math.min(this.maximum, this.current + amount);
  }
  
  toString(): string {
    return `Health(${this.current}/${this.maximum})`;
  }
}

/**
 * Name component for entity identification
 */
export class Name {
  constructor(public value: string = '') {}
  
  toString(): string {
    return `Name("${this.value}")`;
  }
}

/**
 * Sprite component for rendering
 */
export class Sprite {
  constructor(
    public texture: string = '',
    public width: number = 32,
    public height: number = 32,
    public rotation: number = 0
  ) {}
  
  toString(): string {
    return `Sprite("${this.texture}", ${this.width}x${this.height}, rot: ${this.rotation})`;
  }
}

/**
 * Timer component for time-based effects
 */
export class Timer {
  constructor(
    public duration: number = 1.0,
    public elapsed: number = 0,
    public repeat: boolean = false
  ) {}
  
  update(deltaTime: number): boolean {
    this.elapsed += deltaTime;
    
    if (this.elapsed >= this.duration) {
      if (this.repeat) {
        this.elapsed = 0;
        return true; // Timer triggered
      }
      return true; // Timer finished
    }
    
    return false;
  }
  
  reset(): void {
    this.elapsed = 0;
  }
  
  getProgress(): number {
    return Math.min(1.0, this.elapsed / this.duration);
  }
  
  toString(): string {
    return `Timer(${this.elapsed.toFixed(2)}/${this.duration.toFixed(2)}, repeat: ${this.repeat})`;
  }
}

// Register all component types
export const PositionType = componentRegistry.register('Position', Position);
export const VelocityType = componentRegistry.register('Velocity', Velocity);
export const HealthType = componentRegistry.register('Health', Health);
export const NameType = componentRegistry.register('Name', Name);
export const SpriteType = componentRegistry.register('Sprite', Sprite);
export const TimerType = componentRegistry.register('Timer', Timer);

// Export component types for easy access
export const ComponentTypes = {
  Position: PositionType,
  Velocity: VelocityType,
  Health: HealthType,
  Name: NameType,
  Sprite: SpriteType,
  Timer: TimerType
}; 