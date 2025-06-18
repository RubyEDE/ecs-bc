import { componentRegistry } from '../component';

/**
 * User component representing any actor that can sign transactions or own other entities
 * This component associates an entity with a public key for cryptographic operations
 */
export class UserComponent {
  constructor(
    public publicKey: string = ''
  ) {}

  /**
   * Validate that the public key is not empty
   */
  isValid(): boolean {
    return this.publicKey.length > 0;
  }

  /**
   * Get a truncated version of the public key for display purposes
   */
  getDisplayKey(length: number = 8): string {
    if (this.publicKey.length <= length) {
      return this.publicKey;
    }
    return `${this.publicKey.substring(0, length / 2)}...${this.publicKey.substring(this.publicKey.length - length / 2)}`;
  }

  toString(): string {
    return `UserComponent("${this.getDisplayKey()}")`;
  }
}

// Register the component type
export const UserComponentType = componentRegistry.register('UserComponent', UserComponent);

// Export component type for easy access
export const UserComponentTypes = {
  UserComponent: UserComponentType
};
