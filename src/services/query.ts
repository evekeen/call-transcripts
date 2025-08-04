import { Database } from '../database';
import { QueryRequest, QueryResponse, TranscriptExcerpt } from '../types';

export class QueryService {
  private db: Database;

  constructor() {
    this.db = new Database();
  }

  async queryTranscripts(request: QueryRequest): Promise<QueryResponse> {
    const { question, client_account_id, limit = 10 } = request;

    try {
      // Get relevant transcripts
      const transcripts = client_account_id 
        ? await this.db.getTranscriptsByClient(client_account_id)
        : await this.getAllTranscripts();

      // Simple keyword-based search (can be enhanced with embeddings/semantic search)
      const relevantTranscripts = this.findRelevantTranscripts(question, transcripts, limit);
      
      // Generate answer (simplified - would use LLM in production)
      const answer = this.generateAnswer(question, relevantTranscripts);

      return {
        answer,
        relevant_transcripts: relevantTranscripts,
        confidence: this.calculateConfidence(relevantTranscripts),
      };

    } catch (error) {
      console.error('Error querying transcripts:', error);
      throw error;
    }
  }

  private async getAllTranscripts(): Promise<any[]> {
    // TODO: Implement getAllTranscripts in Database class
    return [];
  }

  private findRelevantTranscripts(question: string, transcripts: any[], limit: number): TranscriptExcerpt[] {
    const keywords = this.extractKeywords(question);
    const scored = transcripts.map(transcript => {
      const score = this.calculateRelevanceScore(keywords, transcript);
      return { transcript, score };
    });

    // Sort by relevance score and take top results
    scored.sort((a, b) => b.score - a.score);
    
    return scored
      .slice(0, limit)
      .filter(item => item.score > 0)
      .map(item => ({
        transcript_id: item.transcript.id,
        title: item.transcript.title,
        date: item.transcript.date,
        excerpt: this.extractRelevantExcerpt(keywords, item.transcript.transcript_text),
        relevance_score: item.score,
      }));
  }

  private extractKeywords(question: string): string[] {
    // Simple keyword extraction - would use NLP in production
    return question
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['what', 'when', 'where', 'who', 'how', 'why', 'the', 'and', 'or', 'but'].includes(word));
  }

  private calculateRelevanceScore(keywords: string[], transcript: any): number {
    const text = `${transcript.title} ${transcript.transcript_text} ${transcript.summary || ''}`.toLowerCase();
    
    let score = 0;
    keywords.forEach(keyword => {
      const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
      score += matches;
    });

    return score;
  }

  private extractRelevantExcerpt(keywords: string[], text: string, maxLength: number = 300): string {
    const sentences = text.split(/[.!?]+/);
    
    // Find sentences containing keywords
    const relevantSentences = sentences.filter(sentence => {
      const lower = sentence.toLowerCase();
      return keywords.some(keyword => lower.includes(keyword));
    });

    if (relevantSentences.length === 0) {
      return text.substring(0, maxLength) + '...';
    }

    // Take first few relevant sentences that fit in maxLength
    let excerpt = '';
    for (const sentence of relevantSentences) {
      if (excerpt.length + sentence.length > maxLength) break;
      excerpt += sentence.trim() + '. ';
    }

    return excerpt.trim() || text.substring(0, maxLength) + '...';
  }

  private generateAnswer(question: string, excerpts: TranscriptExcerpt[]): string {
    if (excerpts.length === 0) {
      return "I couldn't find relevant information in the transcripts to answer your question.";
    }

    // Simple answer generation - would use LLM in production
    const sources = excerpts.length === 1 ? '1 transcript' : `${excerpts.length} transcripts`;
    return `Based on ${sources}, here are the relevant excerpts that may answer your question about "${question}". Please review the transcript excerpts below for detailed information.`;
  }

  private calculateConfidence(excerpts: TranscriptExcerpt[]): number {
    if (excerpts.length === 0) return 0;
    
    // Simple confidence calculation based on number and scores of excerpts
    const avgScore = excerpts.reduce((sum, excerpt) => sum + excerpt.relevance_score, 0) / excerpts.length;
    const normalizedScore = Math.min(avgScore / 10, 1); // Normalize to 0-1
    
    return Math.round(normalizedScore * 100) / 100;
  }
}