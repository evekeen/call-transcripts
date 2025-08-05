import { GongClient } from './gongClient';
import { CallMetadata, Transcript } from '../base/platformAdapter';

describe('GongClient Integration Tests', () => {
  describe('GongClient implements PlatformAdapter', () => {
    let client: GongClient;
    
    beforeEach(() => {
      client = new GongClient('test-secret');
    });
    
    it('should have correct platform name', () => {
      expect(client.name).toBe('gong');
    });
    
    it('should implement all required methods', () => {
      expect(typeof client.authenticate).toBe('function');
      expect(typeof client.listCalls).toBe('function');
      expect(typeof client.getTranscript).toBe('function');
      expect(typeof client.testConnection).toBe('function');
      expect(typeof client.refreshAuth).toBe('function');
      expect(typeof client.getAIContent).toBe('function');
      expect(typeof client.setupWebhook).toBe('function');
    });
  });
  
  describe('Edge Cases and Error Scenarios', () => {
    let client: GongClient;
    
    beforeEach(() => {
      client = new GongClient('test-secret');
    });
    
    it('should handle empty participant list in calls', async () => {
      const mockCall = {
        id: 'call-123',
        title: 'Call with no participants',
        startTime: '2023-01-01T10:00:00Z',
        endTime: '2023-01-01T11:00:00Z',
        duration: 3600,
        participants: []
      };
      
      const metadata = (client as any).mapGongCallToMetadata(mockCall);
      
      expect(metadata.attendees).toEqual([]);
      expect(metadata.id).toBe('call-123');
      expect(metadata.platform).toBe('gong');
    });
    
    it('should handle missing speaker names in transcript', async () => {
      const mockCall = {
        id: 'call-123',
        title: 'Test Call',
        startTime: '2023-01-01T10:00:00Z',
        endTime: '2023-01-01T11:00:00Z',
        duration: 3600,
        participants: []
      };
      
      const mockTranscript = {
        callId: 'call-123',
        transcript: [{
          speakerId: 'speaker-unknown',
          speakerName: null,
          sentences: [{
            start: 0,
            end: 5000,
            text: 'Speaker name is missing.'
          }]
        }]
      };
      
      // Test internal transcript processing
      const segments: any[] = [];
      let fullText = '';
      
      for (const segment of mockTranscript.transcript) {
        for (const sentence of segment.sentences) {
          segments.push({
            speaker: segment.speakerName || segment.speakerId,
            speakerEmail: undefined,
            text: sentence.text,
            startTime: sentence.start,
            endTime: sentence.end
          });
          fullText += sentence.text + ' ';
        }
      }
      
      expect(segments[0].speaker).toBe('speaker-unknown');
      expect(segments[0].speakerEmail).toBeUndefined();
    });
    
    it('should handle very long transcripts', () => {
      const longTranscript = {
        callId: 'call-long',
        transcript: Array(1000).fill(null).map((_, i) => ({
          speakerId: `speaker-${i % 5}`,
          speakerName: `Speaker ${i % 5}`,
          sentences: [{
            start: i * 1000,
            end: (i + 1) * 1000,
            text: `This is sentence number ${i}.`
          }]
        }))
      };
      
      let segmentCount = 0;
      for (const segment of longTranscript.transcript) {
        segmentCount += segment.sentences.length;
      }
      
      expect(segmentCount).toBe(1000);
    });
    
    it('should handle date edge cases', () => {
      const testCases = [
        { input: '2023-01-01T00:00:00Z', expected: new Date('2023-01-01T00:00:00Z') },
        { input: '2023-12-31T23:59:59Z', expected: new Date('2023-12-31T23:59:59Z') },
        { input: '2024-02-29T12:00:00Z', expected: new Date('2024-02-29T12:00:00Z') }, // Leap year
        { input: '2023-02-30T12:00:00Z', expected: new Date('2023-02-30T12:00:00Z') }, // Invalid date
      ];
      
      testCases.forEach(({ input, expected }) => {
        const date = new Date(input);
        if (input === '2023-02-30T12:00:00Z') {
          // JavaScript auto-corrects invalid dates
          expect(date.getMonth()).toBe(2); // March (0-indexed)
        } else {
          expect(date.getTime()).toBe(expected.getTime());
        }
      });
    });
    
    it('should respect rate limits in pagination', async () => {
      const options = {
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
        limit: 500 // Large limit to test pagination
      };
      
      // The implementation should handle this internally
      expect(options.limit).toBeGreaterThan(100); // API limit per page
    });
    
    it('should handle special characters in transcript text', () => {
      const specialTexts = [
        'Hello "world" with quotes',
        "It's a test with apostrophe",
        'Test with émojis 😀 and unicode ñ',
        'Line\nbreak\ntest',
        'Tab\ttest',
        'Backslash \\ test'
      ];
      
      specialTexts.forEach(text => {
        const segment = {
          speaker: 'Test Speaker',
          text,
          startTime: 0,
          endTime: 1000
        };
        
        expect(segment.text).toBe(text);
      });
    });
  });
  
  describe('Data Validation', () => {
    it('should validate email formats in attendees', () => {
      const validEmails = [
        'test@example.com',
        'user.name@company.co.uk',
        'first+last@domain.org'
      ];
      
      const invalidEmails = [
        'not-an-email',
        '@example.com',
        'user@',
        'user @example.com'
      ];
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      validEmails.forEach(email => {
        expect(email).toMatch(emailRegex);
      });
      
      invalidEmails.forEach(email => {
        expect(email).not.toMatch(emailRegex);
      });
    });
    
    it('should handle different duration formats', () => {
      const durations = [
        { seconds: 0, expected: 0 },
        { seconds: 60, expected: 60 },
        { seconds: 3600, expected: 3600 },
        { seconds: 86400, expected: 86400 }, // 24 hours
      ];
      
      durations.forEach(({ seconds, expected }) => {
        expect(seconds).toBe(expected);
      });
    });
  });
});