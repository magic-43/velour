import type { ConversationWithParticipants, Profile, HomeStorySession } from '../../types';
import type { MessageWithSender } from '../hooks/useMessages';

const DB_NAME = 'velour_offline_v1';
const DB_VERSION = 1;

export interface OutboxMessage {
  tempId: string;
  conversationId: string;
  senderId: string;
  senderType: 'fan' | 'creator';
  content: string;
  messageType?: string;
  replyToId?: string | null;
  replyTo?: any;
  createdAt: string;
  retries: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function isIndexedDBSupported(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

export function openDB(): Promise<IDBDatabase> {
  if (!isIndexedDBSupported()) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Conversations store
      if (!db.objectStoreNames.contains('conversations')) {
        const store = db.createObjectStore('conversations', { keyPath: 'id' });
        store.createIndex('last_message_at', 'last_message_at', { unique: false });
      }

      // 2. Messages store
      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('conversation_id', 'conversation_id', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }

      // 3. Stories store
      if (!db.objectStoreNames.contains('stories')) {
        db.createObjectStore('stories', { keyPath: 'id' });
      }

      // 4. Profiles store
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'id' });
      }

      // 5. Outbox queue store
      if (!db.objectStoreNames.contains('outbox')) {
        const store = db.createObjectStore('outbox', { keyPath: 'tempId' });
        store.createIndex('conversationId', 'conversationId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

// ── Generic IDB Transaction Helpers ──────────────────────────────────────────

async function performTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result: T;

    try {
      const req = callback(store);
      if (req) {
        req.onsuccess = () => {
          result = req.result;
        };
      }
    } catch (err) {
      reject(err);
    }

    tx.oncomplete = () => {
      resolve(result);
    };

    tx.onerror = () => {
      reject(tx.error);
    };
  });
}

// ── Conversations Cache ──────────────────────────────────────────────────────

export async function getCachedConversations(): Promise<ConversationWithParticipants[]> {
  try {
    return await performTransaction<ConversationWithParticipants[]>('conversations', 'readonly', (store) => {
      return store.getAll();
    });
  } catch (err) {
    console.warn('Failed reading conversations from cache:', err);
    return [];
  }
}

export async function saveCachedConversations(conversations: ConversationWithParticipants[]): Promise<void> {
  if (!conversations || conversations.length === 0) return;
  try {
    const db = await openDB();
    const tx = db.transaction('conversations', 'readwrite');
    const store = tx.objectStore('conversations');

    for (const conv of conversations) {
      store.put(conv);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed saving conversations to cache:', err);
  }
}

export async function getCachedConversation(id: string): Promise<ConversationWithParticipants | null> {
  try {
    return await performTransaction<ConversationWithParticipants | null>('conversations', 'readonly', (store) => {
      return store.get(id);
    });
  } catch (err) {
    console.warn('Failed reading conversation from cache:', err);
    return null;
  }
}

export async function markConversationCachedAsRead(
  conversationId: string,
  isFan: boolean,
  currentUserId?: string
): Promise<void> {
  if (!conversationId) return;
  try {
    const db = await openDB();

    // 1. Update unread counter in conversations object store
    try {
      const convTx = db.transaction('conversations', 'readwrite');
      const convStore = convTx.objectStore('conversations');
      const getReq = convStore.get(conversationId);
      getReq.onsuccess = () => {
        const conv = getReq.result;
        if (conv) {
          if (currentUserId) {
            if (conv.fan_id === currentUserId) conv.fan_unread = 0;
            else conv.creator_unread = 0;
          } else {
            if (isFan) conv.fan_unread = 0;
            else conv.creator_unread = 0;
          }
          convStore.put(conv);
        }
      };
    } catch (e) {
      console.warn('Could not update conversation unread in IDB:', e);
    }

    // 2. Mark all messages for this conversation as read in messages object store
    try {
      const msgTx = db.transaction('messages', 'readwrite');
      const msgStore = msgTx.objectStore('messages');
      const index = msgStore.index('conversation_id');
      const msgReq = index.openCursor(IDBKeyRange.only(conversationId));
      msgReq.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const msg = cursor.value;
          const isIncoming = currentUserId ? msg.sender_id !== currentUserId : true;
          if (isIncoming && msg.status !== 'read') {
            msg.status = 'read';
            msg.read_at = msg.read_at || new Date().toISOString();
            cursor.update(msg);
          }
          cursor.continue();
        }
      };
    } catch (e) {
      console.warn('Could not update messages status in IDB:', e);
    }
  } catch (err) {
    console.warn('Failed marking conversation cached as read:', err);
  }
}

// ── Messages Cache ───────────────────────────────────────────────────────────

export async function getCachedMessages(conversationId: string): Promise<MessageWithSender[]> {
  try {
    const db = await openDB();
    return new Promise<MessageWithSender[]>((resolve, reject) => {
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('conversation_id');
      const request = index.getAll(IDBKeyRange.only(conversationId));

      request.onsuccess = () => {
        const msgs = (request.result || []) as MessageWithSender[];
        // Sort chronologically ascending
        msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        resolve(msgs);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed reading messages from cache:', err);
    return [];
  }
}

export async function saveCachedMessages(messages: MessageWithSender[]): Promise<void> {
  if (!messages || messages.length === 0) return;
  try {
    const db = await openDB();
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');

    for (const msg of messages) {
      store.put(msg);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed saving messages to cache:', err);
  }
}

export async function appendCachedMessage(message: MessageWithSender): Promise<void> {
  try {
    await performTransaction('messages', 'readwrite', (store) => {
      store.put(message);
    });
  } catch (err) {
    console.warn('Failed appending message to cache:', err);
  }
}

export async function updateCachedMessage(tempId: string, confirmed: MessageWithSender): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');

    store.delete(tempId);
    store.put(confirmed);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed updating cached message:', err);
  }
}

export async function deleteCachedMessage(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    store.delete(id);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed deleting cached message:', err);
  }
}

// ── Stories Cache ────────────────────────────────────────────────────────────

export async function getCachedStories(): Promise<HomeStorySession[]> {
  try {
    return await performTransaction<HomeStorySession[]>('stories', 'readonly', (store) => {
      return store.getAll();
    });
  } catch (err) {
    console.warn('Failed reading stories from cache:', err);
    return [];
  }
}

export async function saveCachedStories(sessions: HomeStorySession[]): Promise<void> {
  if (!sessions || sessions.length === 0) return;
  try {
    const db = await openDB();
    const tx = db.transaction('stories', 'readwrite');
    const store = tx.objectStore('stories');

    // Clear old cache and write latest snapshot
    store.clear();
    for (const session of sessions) {
      store.put(session);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed saving stories to cache:', err);
  }
}

// ── Profile Cache ────────────────────────────────────────────────────────────

export async function getCachedProfile(userId: string): Promise<Profile | null> {
  try {
    return await performTransaction<Profile | null>('profiles', 'readonly', (store) => {
      return store.get(userId);
    });
  } catch (err) {
    console.warn('Failed reading profile from cache:', err);
    return null;
  }
}

export async function saveCachedProfile(profile: Profile): Promise<void> {
  if (!profile) return;
  try {
    await performTransaction('profiles', 'readwrite', (store) => {
      store.put(profile);
    });
  } catch (err) {
    console.warn('Failed saving profile to cache:', err);
  }
}

// ── Offline Outbox Queue ─────────────────────────────────────────────────────

export async function queueOutboxMessage(msg: OutboxMessage): Promise<void> {
  try {
    await performTransaction('outbox', 'readwrite', (store) => {
      store.put(msg);
    });
  } catch (err) {
    console.warn('Failed queueing message to outbox:', err);
  }
}

export async function getOutboxMessages(): Promise<OutboxMessage[]> {
  try {
    const list = await performTransaction<OutboxMessage[]>('outbox', 'readonly', (store) => {
      return store.getAll();
    });
    // Sort chronologically
    return (list || []).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch (err) {
    console.warn('Failed reading outbox messages:', err);
    return [];
  }
}

export async function removeOutboxMessage(tempId: string): Promise<void> {
  try {
    await performTransaction('outbox', 'readwrite', (store) => {
      store.delete(tempId);
    });
  } catch (err) {
    console.warn('Failed removing message from outbox:', err);
  }
}
