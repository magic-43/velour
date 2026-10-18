import { supabase } from './supabase';
import { getMyLastSeenPrivacy } from './utils/presenceUtils';

type PresenceListener = (onlineUserIds: Set<string>) => void;

class GlobalPresenceManager {
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private onlineUsers = new Set<string>();
  private listeners = new Set<PresenceListener>();
  private currentUserId: string | null = null;
  private isTracking = false;
  private privacyListenerAttached = false;

  public initialize(userId: string) {
    if (this.currentUserId === userId && this.channel) {
      return;
    }
    this.cleanup();
    this.currentUserId = userId;

    if (!this.privacyListenerAttached) {
      window.addEventListener('velour:privacy_changed', () => {
        this.syncTracking();
      });
      this.privacyListenerAttached = true;
    }

    const channel = supabase.channel('global_presence', {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    this.channel = channel;

    const parseState = () => {
      const state = channel.presenceState();
      const nextSet = new Set<string>();
      Object.keys(state).forEach((key) => {
        const presences = state[key] as Array<{ user_id?: string }>;
        if (presences && presences.length > 0) {
          presences.forEach((p) => {
            if (p.user_id) nextSet.add(p.user_id);
          });
        }
        if (key && !key.startsWith('presence_ref')) {
          nextSet.add(key);
        }
      });
      this.onlineUsers = nextSet;
      this.notifyListeners();
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        parseState();
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (key) this.onlineUsers.add(key);
        (newPresences as Array<{ user_id?: string }>).forEach((p) => {
          if (p.user_id) this.onlineUsers.add(p.user_id);
        });
        this.notifyListeners();
      })
      .on('presence', { event: 'leave' }, () => {
        parseState();
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.syncTracking();
        }
      });
  }

  public syncTracking() {
    if (!this.channel || !this.currentUserId) return;
    const privacy = getMyLastSeenPrivacy(this.currentUserId);
    if (privacy === 'nobody') {
      if (this.isTracking) {
        this.channel.untrack().catch(() => {});
        this.isTracking = false;
      }
    } else {
      this.channel
        .track({
          user_id: this.currentUserId,
          online_at: new Date().toISOString(),
        })
        .then(() => {
          this.isTracking = true;
        })
        .catch(() => {});
    }
  }

  public subscribe(listener: PresenceListener): () => void {
    this.listeners.add(listener);
    listener(this.onlineUsers);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getOnlineUserIds(): Set<string> {
    return this.onlineUsers;
  }

  public isOnline(userId?: string | null): boolean {
    if (!userId) return false;
    return this.onlineUsers.has(userId);
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.onlineUsers);
      } catch (err) {
        console.error('Error in presence listener:', err);
      }
    });
  }

  public cleanup() {
    if (this.channel) {
      if (this.isTracking) {
        this.channel.untrack().catch(() => {});
      }
      supabase.removeChannel(this.channel).catch(() => {});
      this.channel = null;
      this.isTracking = false;
    }
    this.onlineUsers.clear();
    this.currentUserId = null;
  }
}

export const globalPresenceManager = new GlobalPresenceManager();
