import sqlite3 from 'sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config';
import { ClientAccount, TranscriptRecord, GroupingRule } from '../types';

export class Database {
  private db: sqlite3.Database;

  constructor() {
    this.db = new sqlite3.Database(config.database.path);
    this.initialize();
  }

  private initialize(): void {
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    this.db.exec(schema, (err) => {
      if (err) {
        console.error('Database initialization error:', err);
        throw err;
      }
      console.log('Database initialized successfully');
    });
  }

  async createClientAccount(account: Omit<ClientAccount, 'created_at' | 'updated_at'>): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO client_accounts (id, name, domain, grouping_rule) 
        VALUES (?, ?, ?, ?)
      `);
      
      stmt.run([account.id, account.name, account.domain, account.grouping_rule], function(err) {
        if (err) reject(err);
        else resolve();
      });
      
      stmt.finalize();
    });
  }

  async getClientAccounts(): Promise<ClientAccount[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM client_accounts ORDER BY name', (err, rows) => {
        if (err) reject(err);
        else resolve(rows as ClientAccount[]);
      });
    });
  }

  async createTranscript(transcript: Omit<TranscriptRecord, 'created_at' | 'updated_at'>): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO transcripts 
        (id, fireflies_id, client_account_id, title, transcript_text, date, duration, attendees, summary) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run([
        transcript.id,
        transcript.fireflies_id,
        transcript.client_account_id,
        transcript.title,
        transcript.transcript_text,
        transcript.date,
        transcript.duration,
        transcript.attendees,
        transcript.summary
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
      
      stmt.finalize();
    });
  }

  async getTranscriptsByClient(clientAccountId: string): Promise<TranscriptRecord[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM transcripts WHERE client_account_id = ? ORDER BY date DESC',
        [clientAccountId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows as TranscriptRecord[]);
        }
      );
    });
  }

  async getTranscriptByFirefliesId(firefliesId: string): Promise<TranscriptRecord | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM transcripts WHERE fireflies_id = ?',
        [firefliesId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row as TranscriptRecord || null);
        }
      );
    });
  }

  async createGroupingRule(rule: Omit<GroupingRule, 'id'>): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO grouping_rules (type, value, client_account_id) 
        VALUES (?, ?, ?)
      `);
      
      stmt.run([rule.type, rule.value, rule.client_account_id], function(err) {
        if (err) reject(err);
        else resolve();
      });
      
      stmt.finalize();
    });
  }

  async getGroupingRules(): Promise<GroupingRule[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM grouping_rules', (err, rows) => {
        if (err) reject(err);
        else resolve(rows as GroupingRule[]);
      });
    });
  }

  async logApiUsage(endpoint: string, success: boolean, errorMessage?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO api_usage (endpoint, success, error_message) 
        VALUES (?, ?, ?)
      `);
      
      stmt.run([endpoint, success, errorMessage || null], function(err) {
        if (err) reject(err);
        else resolve();
      });
      
      stmt.finalize();
    });
  }

  async getApiUsageToday(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT COUNT(*) as count FROM api_usage WHERE date(timestamp) = date("now") AND success = 1',
        (err, row: any) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
  }

  close(): void {
    this.db.close();
  }
}