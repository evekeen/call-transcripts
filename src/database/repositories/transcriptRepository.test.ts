import { TranscriptRepository } from './transcriptRepository';
import { createClient } from '@supabase/supabase-js';
import { Transcript } from '../../integrations/base/platformAdapter';

jest.mock('@supabase/supabase-js');

describe('TranscriptRepository', () => {
  let repository: TranscriptRepository;
  let mockSupabaseClient: any;
  let createQueryMock: () => any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create comprehensive mock chains for all Supabase operations
    createQueryMock = (): any => {
      const mock: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        textSearch: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn(),
        then: jest.fn((callback: any): Promise<any> => Promise.resolve(callback(mock))),
        // Make the query object itself awaitable
        valueOf: jest.fn(),
        toString: jest.fn()
      };
      
      // Make it a thenable/awaitable
      Object.assign(mock, {
        then: (resolve: any, reject: any): Promise<any> => {
          return Promise.resolve(mock).then(resolve, reject);
        }
      });
      
      return mock;
    };

    mockSupabaseClient = {
      from: jest.fn(() => ({
        select: jest.fn(() => createQueryMock()),
        insert: jest.fn(() => createQueryMock()),
        update: jest.fn(() => createQueryMock()),
        delete: jest.fn(() => createQueryMock())
      }))
    };
    
    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);
    
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

      // Mock successful transcript insert
      const transcriptQuery = createQueryMock();
      transcriptQuery.single.mockResolvedValue({ data: mockTranscriptRecord, error: null });

      // Mock successful segment operations
      const segmentDeleteQuery = createQueryMock();
      segmentDeleteQuery.then = jest.fn((resolve) => {
        return Promise.resolve(resolve({ error: null }));
      });
      
      const segmentInsertQuery = createQueryMock();
      segmentInsertQuery.then = jest.fn((resolve) => {
        return Promise.resolve(resolve({ data: [], error: null }));
      });

      mockSupabaseClient.from
        .mockReturnValueOnce({ insert: jest.fn(() => transcriptQuery) })
        .mockReturnValueOnce({ delete: jest.fn(() => segmentDeleteQuery) })
        .mockReturnValueOnce({ insert: jest.fn(() => segmentInsertQuery) });

      const result = await repository.createTranscript(mockTranscript, 'account-456');

      expect(result).toEqual(mockTranscriptRecord);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('transcripts');
    });

    it('should handle duplicate transcript by updating', async () => {
      const duplicateError = {
        code: '23505',
        message: 'Duplicate key'
      };

      const mockTranscriptRecord = {
        id: 'call-123',
        account_id: 'account-456',
        platform: 'gong',
        title: 'Test Call'
      };

      // Mock failed insert with duplicate error
      const transcriptInsertQuery = createQueryMock();
      transcriptInsertQuery.single.mockResolvedValue({ data: null, error: duplicateError });

      // Mock successful update
      const transcriptUpdateQuery = createQueryMock();
      transcriptUpdateQuery.single.mockResolvedValue({ data: mockTranscriptRecord, error: null });

      // Mock segment operations
      const segmentDeleteQuery = createQueryMock();
      segmentDeleteQuery.then = jest.fn((resolve) => {
        return Promise.resolve(resolve({ error: null }));
      });
      
      const segmentInsertQuery = createQueryMock();
      segmentInsertQuery.then = jest.fn((resolve) => {
        return Promise.resolve(resolve({ data: [], error: null }));
      });

      mockSupabaseClient.from
        .mockReturnValueOnce({ insert: jest.fn(() => transcriptInsertQuery) })  // insert fails
        .mockReturnValueOnce({ update: jest.fn(() => transcriptUpdateQuery) })  // update succeeds
        .mockReturnValueOnce({ delete: jest.fn(() => segmentDeleteQuery) })     // segment delete
        .mockReturnValueOnce({ insert: jest.fn(() => segmentInsertQuery) });    // segment insert

      const result = await repository.createTranscript(mockTranscript, 'account-456');

      expect(result).toEqual(mockTranscriptRecord);
    });

    it('should throw error on insert failure', async () => {
      const transcriptQuery = createQueryMock();
      transcriptQuery.single.mockResolvedValue({ 
        data: null, 
        error: { message: 'Insert failed' } 
      });

      mockSupabaseClient.from.mockReturnValue({ 
        insert: jest.fn(() => transcriptQuery) 
      });

      await expect(repository.createTranscript(mockTranscript, 'account-456')).rejects.toThrow(
        'Failed to create transcript: Insert failed'
      );
    });
  });

  describe('getTranscriptById', () => {
    it('should return transcript when found', async () => {
      const mockTranscriptRecord = {
        id: 'call-123',
        title: 'Test Call',
        platform: 'gong'
      };

      const query = createQueryMock();
      query.single.mockResolvedValue({
        data: mockTranscriptRecord,
        error: null
      });

      mockSupabaseClient.from.mockReturnValue({ select: jest.fn(() => query) });

      const result = await repository.getTranscriptById('call-123');

      expect(result).toEqual(mockTranscriptRecord);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('transcripts');
    });

    it('should return null when transcript not found', async () => {
      const query = createQueryMock();
      query.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }
      });

      mockSupabaseClient.from.mockReturnValue({ select: jest.fn(() => query) });

      const result = await repository.getTranscriptById('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error on database error', async () => {
      const query = createQueryMock();
      query.single.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      mockSupabaseClient.from.mockReturnValue({ select: jest.fn(() => query) });

      await expect(repository.getTranscriptById('call-123')).rejects.toThrow(
        'Failed to get transcript: Database connection failed'
      );
    });
  });

  describe('searchTranscripts', () => {
    it('should search transcripts with all filters', async () => {
      const mockResults = [{ id: 'call-123', title: 'Test Call' }];

      const query = createQueryMock();
      // Override the then method to resolve with the mock data
      query.then = jest.fn((resolve) => {
        return Promise.resolve(resolve({
          data: mockResults,
          error: null,
          count: 1
        }));
      });

      mockSupabaseClient.from.mockReturnValue({ select: jest.fn(() => query) });
      
      // Mock the segment search query
      const segmentQuery = createQueryMock();
      segmentQuery.then = jest.fn((resolve) => {
        return Promise.resolve(resolve({ data: [], error: null }));
      });
      
      mockSupabaseClient.from.mockReturnValueOnce({ select: jest.fn(() => query) });
      mockSupabaseClient.from.mockReturnValueOnce({ select: jest.fn(() => segmentQuery) });

      const options = {
        accountIds: ['account-1', 'account-2'],
        platforms: ['gong', 'clari'] as string[],
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-31'),
        query: 'test search',
        limit: 10,
        offset: 0
      };

      const result = await repository.searchTranscripts(options);

      expect(result.transcripts).toEqual(mockResults);
      expect(result.totalCount).toBe(1);
    });

    it('should search without filters', async () => {
      const query = createQueryMock();
      query.then = jest.fn((resolve) => {
        return Promise.resolve(resolve({
          data: [],
          error: null,
          count: 0
        }));
      });

      mockSupabaseClient.from.mockReturnValue({ select: jest.fn(() => query) });

      const result = await repository.searchTranscripts({});

      expect(result.transcripts).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('should handle search errors', async () => {
      const query = createQueryMock();
      query.then = jest.fn((resolve) => {
        return Promise.resolve(resolve({
          data: null,
          error: { message: 'Search failed' },
          count: null
        }));
      });

      mockSupabaseClient.from.mockReturnValue({ select: jest.fn(() => query) });

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

      const query = createQueryMock();
      query.single.mockResolvedValue({
        data: mockAccount,
        error: null
      });

      mockSupabaseClient.from.mockReturnValue({ select: jest.fn(() => query) });

      const result = await repository.getAccountByDomain('test.com');

      expect(result).toEqual(mockAccount);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('accounts');
    });

    it('should return null when account not found', async () => {
      const query = createQueryMock();
      query.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }
      });

      mockSupabaseClient.from.mockReturnValue({ select: jest.fn(() => query) });

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

      const query = createQueryMock();
      query.single.mockResolvedValue({
        data: mockAccount,
        error: null
      });

      mockSupabaseClient.from.mockReturnValue({ insert: jest.fn(() => query) });

      const result = await repository.createAccount('Test Company', 'test.com');

      expect(result).toEqual(mockAccount);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('accounts');
    });

    it('should handle account creation error', async () => {
      const query = createQueryMock();
      query.single.mockResolvedValue({
        data: null,
        error: { message: 'Unique constraint violation' }
      });

      mockSupabaseClient.from.mockReturnValue({ insert: jest.fn(() => query) });

      await expect(
        repository.createAccount('Test Company', 'test.com')
      ).rejects.toThrow('Failed to create account: Unique constraint violation');
    });
  });

  describe('deleteTranscript', () => {
    it('should delete transcript successfully', async () => {
      const query = createQueryMock();
      query.then = jest.fn((resolve) => {
        return Promise.resolve(resolve({ error: null }));
      });

      mockSupabaseClient.from.mockReturnValue({ delete: jest.fn(() => query) });

      await repository.deleteTranscript('call-123');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('transcripts');
    });

    it('should handle deletion error', async () => {
      const query = createQueryMock();
      query.then = jest.fn((resolve) => {
        return Promise.resolve(resolve({
          error: { message: 'Delete failed' }
        }));
      });

      mockSupabaseClient.from.mockReturnValue({ delete: jest.fn(() => query) });

      await expect(repository.deleteTranscript('call-123')).rejects.toThrow(
        'Failed to delete transcript: Delete failed'
      );
    });
  });

  describe('getProcessingStats', () => {
    it('should return processing statistics', async () => {
      // Mock total count query
      const totalCountQuery = createQueryMock();
      totalCountQuery.then = jest.fn((resolve) => {
        return Promise.resolve(resolve({ count: 100 }));
      });

      // Mock platform data query  
      const platformQuery = createQueryMock();
      platformQuery.then = jest.fn((callback) => {
        // This query has a callback that processes the data
        return Promise.resolve(callback({
          data: [
            { platform: 'gong' },
            { platform: 'gong' },
            { platform: 'clari' }
          ]
        }));
      });

      // Mock recent transcripts query
      const recentQuery = createQueryMock();
      recentQuery.then = jest.fn((resolve) => {
        return Promise.resolve(resolve({ count: 25 }));
      });

      // Setup different returns for each call
      mockSupabaseClient.from
        .mockReturnValueOnce({ select: jest.fn(() => totalCountQuery) })      // total count
        .mockReturnValueOnce({ select: jest.fn(() => platformQuery) })       // platform breakdown
        .mockReturnValueOnce({ select: jest.fn(() => recentQuery) });        // recent transcripts

      const stats = await repository.getProcessingStats();

      expect(stats.totalTranscripts).toBe(100);
      expect(stats.transcriptsByPlatform).toEqual({ gong: 2, clari: 1 });
      expect(stats.transcriptsLastWeek).toBe(25);
    });
  });
});