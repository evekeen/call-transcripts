import { PlatformAdapter } from './base/platformAdapter';
import { GongClient } from './gong/gongClient';
import { ClariClient } from './clari/clariClient';
import { FirefliesClient } from './fireflies/firefliesClient';

export type PlatformType = 'gong' | 'clari' | 'fireflies' | 'fathom' | 'otter';

export class PlatformFactory {
  private static instances: Map<string, PlatformAdapter> = new Map();

  static createClient(platform: PlatformType, secretName: string, region?: string): PlatformAdapter {
    const key = `${platform}-${secretName}`;
    
    if (this.instances.has(key)) {
      return this.instances.get(key)!;
    }

    let client: PlatformAdapter;

    switch (platform) {
      case 'gong':
        client = new GongClient(secretName, region);
        break;
      case 'clari':
        client = new ClariClient(secretName, region);
        break;
      case 'fireflies':
        client = new FirefliesClient(secretName, region);
        break;
      case 'fathom':
        throw new Error('Fathom integration not yet implemented');
      case 'otter':
        throw new Error('Otter integration not yet implemented');
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    this.instances.set(key, client);
    return client;
  }

  static getAllSupportedPlatforms(): PlatformType[] {
    return ['gong', 'clari', 'fireflies'];
  }

  static clearCache(): void {
    this.instances.clear();
  }
}