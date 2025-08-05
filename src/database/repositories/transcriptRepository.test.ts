import { TranscriptRepository } from './transcriptRepository';
import { createClient } from '@supabase/supabase-js';
import { Transcript } from '../../integrations/base/platformAdapter';

jest.mock('@supabase/supabase-js');

const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  textSearch: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  single: jest.fn(),
  then: jest.fn()
};

(createClient as jest.Mock).mockReturnValue(mockSupabaseClient);

describe('TranscriptRepository', () => {
  let repository: TranscriptRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new TranscriptRepository('https://test.supabase.co', 'test-key');
  });

  const mockTranscript: Transcript = {
    callId: 'call-123',
    segments: [
      {
        speaker: 'John Doe',
        speakerEmail: 'john@example.com',
        text: 'Hello, this is a test.',
        startTime: 0,
        endTime: 5000,
        confidence: 0.95
      }
    ],
    fullText: 'Hello, this is a test.',
    metadata: {
      id: 'call-123',
      title: 'Test Call',
      startTime: new Date('2023-01-01T10:00:00Z'),
      endTime: new Date('2023-01-01T11:00:00Z'),
      duration: 3600,
      attendees: [
        { email: 'john@example.com', name: 'John Doe', role: 'host' },
        { email: 'jane@client.com', name: 'Jane Smith', role: 'participant' }
      ],
      platform: 'gong'
    }
  };

  describe('constructor', () => {
    it('should throw error if missing Supabase credentials', () => {
      expect(() => new TranscriptRepository()).toThrow('Missing Supabase URL or service key');
    });

    it('should create client with provided credentials', () => {
      expect(createClient).toHaveBeenCalledWith('https://test.supabase.co', 'test-key');
    });
  });

  describe('createTranscript', () => {
    it('should create transcript and segments successfully', async () => {
      const mockTranscriptRecord = {
        id: 'call-123',
        account_id: 'account-456',
        platform: 'gong',
        title: 'Test Call'
      };

      const mockSegmentRecords = [
        {
          id: 'segment-1',
          transcript_id: 'call-123',
          sequence_number: 0,
          speaker: 'John Doe'
        }
      ];

      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: mockTranscriptRecord, error: null })
        .mockResolvedValue({ data: mockSegmentRecords, error: null });

      mockSupabaseClient.delete.mockResolvedValue({ error: null });

      const result = await repository.createTranscript(mockTranscript, 'account-456');

      expect(result).toEqual(mockTranscriptRecord);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('transcripts');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('transcript_segments');
    });

    it('should handle transcript creation error', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Duplicate key violation' }
      });

      await expect(
        repository.createTranscript(mockTranscript, 'account-456')
      ).rejects.toThrow('Failed to create transcript: Duplicate key violation');
    });
  });

  describe('getTranscriptById', () => {
    it('should return transcript when found', async () => {
      const mockTranscriptRecord = {
        id: 'call-123',
        title: 'Test Call',
        platform: 'gong'
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: mockTranscriptRecord,
        error: null
      });

      const result = await repository.getTranscriptById('call-123');

      expect(result).toEqual(mockTranscriptRecord);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'call-123');
    });

    it('should return null when transcript not found', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' } // Not found error
      });

      const result = await repository.getTranscriptById('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error on database error', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      await expect(repository.getTranscriptById('call-123')).rejects.toThrow(
        'Failed to get transcript: Database connection failed'
      );
    });
  });

  describe('searchTranscripts', () => {
    it('should search transcripts with all filters', async () => {
      const mockResults = {
        data: [{ id: 'call-123', title: 'Test Call' }],
        error: null,
        count: 1
      };

      // Mock the method chain
      const mockQuery = {
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        textSearch: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnValue(Promise.resolve(mockResults))
      };

      mockSupabaseClient.select.mockReturnValue(mockQuery);

      const options = {
        accountIds: ['account-1', 'account-2'],
        platforms: ['gong', 'clari'],
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-31'),
        query: 'test search',
        limit: 10,
        offset: 0
      };

      const result = await repository.searchTranscripts(options);

      expect(result.transcripts).toEqual([{ id: 'call-123', title: 'Test Call' }]);
      expect(result.totalCount).toBe(1);
      expect(mockQuery.in).toHaveBeenCalledWith('account_id', options.accountIds);
      expect(mockQuery.in).toHaveBeenCalledWith('platform', options.platforms);
      expect(mockQuery.textSearch).toHaveBeenCalledWith('full_text', 'test search');
    });

    it('should search without filters', async () => {
      const mockResults = {
        data: [],
        error: null,
        count: 0
      };

      const mockQuery = {
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnValue(Promise.resolve(mockResults))
      };

      mockSupabaseClient.select.mockReturnValue(mockQuery);

      const result = await repository.searchTranscripts({});

      expect(result.transcripts).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('should handle search errors', async () => {
      const mockQuery = {
        order: jest.fn().mockReturnValue(Promise.resolve({
          data: null,
          error: { message: 'Search failed' },
          count: null
        }))
      };

      mockSupabaseClient.select.mockReturnValue(mockQuery);

      await expect(repository.searchTranscripts({})).rejects.toThrow(
        'Failed to search transcripts: Search failed'
      );
    });
  });

  describe('getAccountByDomain', () => {
    it('should return account when found', async () => {
      const mockAccount = {
        id: 'account-123',
        name: 'Test Company',
        domain: 'test.com'
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: mockAccount,
        error: null
      });

      const result = await repository.getAccountByDomain('test.com');

      expect(result).toEqual(mockAccount);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('domain', 'test.com');
    });

    it('should return null when account not found', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }
      });

      const result = await repository.getAccountByDomain('nonexistent.com');

      expect(result).toBeNull();
    });
  });

  describe('createAccount', () => {
    it('should create account successfully', async () => {
      const mockAccount = {
        id: 'account-123',
        name: 'Test Company',
        domain: 'test.com'
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: mockAccount,
        error: null
      });

      const result = await repository.createAccount('Test Company', 'test.com');

      expect(result).toEqual(mockAccount);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        name: 'Test Company',
        domain: 'test.com',
        metadata: {}
      });
    });

    it('should handle account creation error', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Unique constraint violation' }
      });

      await expect(
        repository.createAccount('Test Company', 'test.com')
      ).rejects.toThrow('Failed to create account: Unique constraint violation');
    });
  });

  describe('deleteTranscript', () => {
    it('should delete transcript successfully', async () => {
      mockSupabaseClient.delete.mockResolvedValue({ error: null });

      await repository.deleteTranscript('call-123');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('transcripts');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'call-123');
    });

    it('should handle deletion error', async () => {
      mockSupabaseClient.delete.mockResolvedValue({
        error: { message: 'Delete failed' }
      });

      await expect(repository.deleteTranscript('call-123')).rejects.toThrow(
        'Failed to delete transcript: Delete failed'
      );
    });
  });

  describe('getProcessingStats', () => {
    it('should return processing statistics', async () => {
      // Mock total count
      const mockTotalCount = { count: 100 };
      
      // Mock platform data
      const mockPlatformData = { data: [
        { platform: 'gong' },
        { platform: 'gong' },
        { platform: 'clari' }
      ]};

      // Mock weekly count
      const mockWeeklyCount = { count: 25 };

      // Setup the chain of mocks
      mockSupabaseClient.select
        .mockReturnValueOnce({ then: jest.fn().mockResolvedValue(mockTotalCount) })
        .mockReturnValueOnce({ then: jest.fn().mockResolvedValue(mockPlatformData) })
        .mockReturnValueOnce({ then: jest.fn().mockResolvedValue(mockWeeklyCount) });

      const result = await repository.getProcessingStats();

      expect(result.totalTranscripts).toBe(100);
      expect(result.transcriptsLastWeek).toBe(25);
      expect(result.averageProcessingTime).toBe(0);
    });
  });
});