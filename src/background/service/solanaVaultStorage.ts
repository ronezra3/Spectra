import { SolanaVaultStorage } from './solanaVault';

const DATABASE_NAME = 'omniwallet-solana-vault';
const STORE_NAME = 'vault';
const VAULT_KEY = 'encrypted-v1';

/**
 * A single IndexedDB transaction provides compare-and-write serialization even
 * across competing extension contexts. Only ciphertext is stored here.
 */
export class SolanaIndexedDbStorage implements SolanaVaultStorage {
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        if (blocked) {
          database.close();
          return;
        }
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () =>
        reject(new Error('Could not open Solana vault storage'));
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Solana vault storage is blocked'));
      };
    });
  }

  async read(): Promise<string | null> {
    const database = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(VAULT_KEY);
        let result: string | null = null;
        request.onsuccess = () => {
          const value: unknown = request.result;
          if (value === undefined) return;
          if (typeof value !== 'string' || !value) {
            transaction.abort();
            return;
          }
          result = value;
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = transaction.onerror = () =>
          reject(new Error('Could not read Solana vault storage'));
      });
    } finally {
      database.close();
    }
  }

  async compareAndWrite(
    expected: string | null,
    ciphertext: string
  ): Promise<boolean> {
    if (!ciphertext) throw new Error('Invalid encrypted Solana vault');
    const database = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(VAULT_KEY);
        let matched = false;
        request.onsuccess = () => {
          const value: unknown = request.result;
          if (value !== undefined && (typeof value !== 'string' || !value)) {
            transaction.abort();
            return;
          }
          if ((value ?? null) !== expected) return;
          matched = true;
          store.put(ciphertext, VAULT_KEY);
        };
        transaction.oncomplete = () => resolve(matched);
        transaction.onabort = transaction.onerror = () =>
          reject(new Error('Could not write Solana vault storage'));
      });
    } finally {
      database.close();
    }
  }
}
