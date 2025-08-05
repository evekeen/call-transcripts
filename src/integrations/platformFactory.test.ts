import { PlatformFactory } from './platformFactory';
import { GongClient } from './gong/gongClient';
import { ClariClient } from './clari/clariClient';
import { FirefliesClient } from './fireflies/firefliesClient';

jest.mock('./gong/gongClient');
jest.mock('./clari/clariClient');
jest.mock('./fireflies/firefliesClient');

describe('PlatformFactory', () => {
  beforeEach(() => {
    PlatformFactory.clearCache();
    jest.clearAllMocks();
  });

  describe('createClient', () => {
    it('should create Gong client', () => {
      const client = PlatformFactory.createClient('gong', 'test-secret');
      expect(GongClient).toHaveBeenCalledWith('test-secret', undefined);
      expect(client).toBeInstanceOf(GongClient);
    });

    it('should create Clari client', () => {
      const client = PlatformFactory.createClient('clari', 'test-secret', 'us-west-2');
      expect(ClariClient).toHaveBeenCalledWith('test-secret', 'us-west-2');
      expect(client).toBeInstanceOf(ClariClient);
    });

    it('should create Fireflies client', () => {
      const client = PlatformFactory.createClient('fireflies', 'test-secret');
      expect(FirefliesClient).toHaveBeenCalledWith('test-secret', undefined);
      expect(client).toBeInstanceOf(FirefliesClient);
    });

    it('should throw error for unsupported platforms', () => {
      expect(() => {
        PlatformFactory.createClient('fathom' as any, 'test-secret');
      }).toThrow('Fathom integration not yet implemented');

      expect(() => {
        PlatformFactory.createClient('otter' as any, 'test-secret');
      }).toThrow('Otter integration not yet implemented');

      expect(() => {
        PlatformFactory.createClient('invalid' as any, 'test-secret');
      }).toThrow('Unsupported platform: invalid');
    });

    it('should cache client instances', () => {
      const client1 = PlatformFactory.createClient('gong', 'test-secret');
      const client2 = PlatformFactory.createClient('gong', 'test-secret');
      
      expect(client1).toBe(client2);
      expect(GongClient).toHaveBeenCalledTimes(1);
    });

    it('should create different instances for different secrets', () => {
      const client1 = PlatformFactory.createClient('gong', 'secret-1');
      const client2 = PlatformFactory.createClient('gong', 'secret-2');
      
      expect(client1).not.toBe(client2);
      expect(GongClient).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAllSupportedPlatforms', () => {
    it('should return list of supported platforms', () => {
      const platforms = PlatformFactory.getAllSupportedPlatforms();
      expect(platforms).toEqual(['gong', 'clari', 'fireflies']);
    });
  });

  describe('clearCache', () => {
    it('should clear the instance cache', () => {
      const client1 = PlatformFactory.createClient('gong', 'test-secret');
      PlatformFactory.clearCache();
      const client2 = PlatformFactory.createClient('gong', 'test-secret');
      
      expect(client1).not.toBe(client2);
      expect(GongClient).toHaveBeenCalledTimes(2);
    });
  });
});