import { PlatformAdapter, CallMetadata, Transcript, TranscriptSegment } from './platformAdapter';

// Mock implementation for testing the interface
class MockPlatformAdapter implements PlatformAdapter {
  name = 'mock';
  
  async authenticate(): Promise<void> {
    // Mock authentication
  }
  
  async listCalls(): Promise<CallMetadata[]> {
    return [{
      id: 'mock-call-1',
      title: 'Mock Call',
      startTime: new Date('2023-01-01T10:00:00Z'),
      endTime: new Date('2023-01-01T11:00:00Z'),
      duration: 3600,
      attendees: [{
        email: 'test@example.com',
        name: 'Test User',
        role: 'host'
      }],
      platform: 'gong'
    }];
  }
  
  async getTranscript(callId: string): Promise<Transcript> {
    const segments: TranscriptSegment[] = [{
      speaker: 'Test Speaker',
      speakerEmail: 'test@example.com',
      text: 'This is a test transcript.',
      startTime: 0,
      endTime: 5000,
      confidence: 0.95
    }];
    
    return {
      callId,
      segments,
      fullText: 'This is a test transcript.',
      metadata: {
        id: callId,
        title: 'Test Call',
        startTime: new Date('2023-01-01T10:00:00Z'),
        endTime: new Date('2023-01-01T11:00:00Z'),
        duration: 3600,
        attendees: [{
          email: 'test@example.com',
          name: 'Test User',
          role: 'host'
        }],
        platform: 'gong'
      }
    };
  }
  
  async testConnection(): Promise<boolean> {
    return true;
  }
}

describe('PlatformAdapter Interface', () => {
  let adapter: PlatformAdapter;
  
  beforeEach(() => {
    adapter = new MockPlatformAdapter();
  });
  
  it('should have required properties', () => {
    expect(adapter.name).toBeDefined();
    expect(typeof adapter.name).toBe('string');
  });
  
  it('should implement authenticate method', async () => {
    await expect(adapter.authenticate({})).resolves.not.toThrow();
  });
  
  it('should implement listCalls method', async () => {
    const calls = await adapter.listCalls({
      startDate: new Date('2023-01-01'),
      endDate: new Date('2023-01-02')
    });
    
    expect(Array.isArray(calls)).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    
    const call = calls[0];
    expect(call).toHaveProperty('id');
    expect(call).toHaveProperty('title');
    expect(call).toHaveProperty('startTime');
    expect(call).toHaveProperty('endTime');
    expect(call).toHaveProperty('duration');
    expect(call).toHaveProperty('attendees');
    expect(call).toHaveProperty('platform');
  });
  
  it('should implement getTranscript method', async () => {
    const transcript = await adapter.getTranscript('test-call-id');
    
    expect(transcript).toHaveProperty('callId');
    expect(transcript).toHaveProperty('segments');
    expect(transcript).toHaveProperty('fullText');
    expect(transcript).toHaveProperty('metadata');
    
    expect(Array.isArray(transcript.segments)).toBe(true);
    expect(transcript.segments.length).toBeGreaterThan(0);
    
    const segment = transcript.segments[0];
    expect(segment).toHaveProperty('speaker');
    expect(segment).toHaveProperty('text');
    expect(segment).toHaveProperty('startTime');
    expect(segment).toHaveProperty('endTime');
  });
  
  it('should implement testConnection method', async () => {
    const result = await adapter.testConnection();
    expect(typeof result).toBe('boolean');
  });
  
  describe('Data Types', () => {
    it('should have valid attendee structure', () => {
      const attendee = {
        email: 'test@example.com',
        name: 'Test User',
        role: 'host' as const,
        company: 'Test Company'
      };
      
      expect(attendee.email).toBeDefined();
      expect(attendee.role).toMatch(/^(host|participant)$/);
    });
    
    it('should have valid platform values', () => {
      const validPlatforms = ['gong', 'clari', 'fathom', 'fireflies', 'otter'];
      const metadata: CallMetadata = {
        id: 'test',
        title: 'Test',
        startTime: new Date(),
        endTime: new Date(),
        duration: 3600,
        attendees: [],
        platform: 'gong'
      };
      
      expect(validPlatforms).toContain(metadata.platform);
    });
  });
});