import { supabase } from './supabase';
import { getMyLastSeenPrivacy } from './utils/presenceUtils';

export type PresenceListener = (onlineUserIds: Set<string>, hiddenUserIds: Set<string>) => void;

class GlobalPresenceManager {
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private onlineUsers = new Set<string>();
  private hiddenUsers = new Set<string>();
  private listeners = new Set<PresenceListener>();
  private currentUserId: string | null = null;
  private isTracking = false;
  private privacyListenerAttached = false;
  private keepAliveTimer: any = null;

  public initialize(userId: string) {
    if (this.currentUserId === userId && this.channel) {
      return;
    }
    this.cleanup();
    this.currentUserId = userId;

    if (!this.privacyListenerAttached) {
      window.addEventListener('velour:privacy_changed', () => {
        this.syncTracking(true);
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
      const nextOnline = new Set<string>();
      const nextHidden = new Set<string>();

      Object.values(state).forEach((presences) => {
        (presences as Array<{ user_id?: string; hidden?: boolean }>).forEach((p) => {
          if (p.user_id) {
            if (p.hidden) {
              nextHidden.add(p.user_id);
            } else {
              nextOnline.add(p.user_id);
            }
          }
        });
      });

      // Explicitly hidden users never appear online
      nextHidden.forEach((uid) => nextOnline.delete(uid));

      this.onlineUsers = nextOnline;
      this.hiddenUsers = nextHidden;
      this.notifyListeners();
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        parseState();
      })
      .on('presence', { event: 'join' }, () => {
        parseState();
      })
      .on('presence', { event: 'leave' }, () => {
        parseState();
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.syncTracking(true);
          this.startKeepAlive();
        }
      });
  }

  private startKeepAlive() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    // Send periodic presence re-track every 25 seconds to prevent timeout drops
    this.keepAliveTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        this.syncTracking();
      }
    }, 25000);
  }

  public touch() {
    this.syncTracking();
  }

  public syncTracking(force = false) {
    if (!this.channel || !this.currentUserId) return;
    const privacy = getMyLastSeenPrivacy(this.currentUserId);
    const isHidden = privacy === 'nobody';

    this.channel
      .track({
        user_id: this.currentUserId,
        hidden: isHidden,
        online_at: new Date().toISOString(),
      })
      .then(() => {
        this.isTracking = true;
      })
      .catch((err) => {
        console.warn('Presence track error:', err);
      });
  }

  public subscribe(listener: PresenceListener): () => void {
    this.listeners.add(listener);
    listener(this.onlineUsers, this.hiddenUsers);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getOnlineUserIds(): Set<string> {
    return this.onlineUsers;
  }

  public getHiddenUserIds(): Set<string> {
    return this.hiddenUsers;
  }

  public isHidden(userId?: string | null): boolean {
    if (!userId) return false;
    return this.hiddenUsers.has(userId);
  }

  public isOnline(userId?: string | null): boolean {
    if (!userId) return false;
    if (this.hiddenUsers.has(userId)) return false;
    return this.onlineUsers.has(userId);
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.onlineUsers, this.hiddenUsers);
      } catch (err) {
        console.error('Error in presence listener:', err);
      }
    });
  }

  public cleanup() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.channel) {
      if (this.isTracking) {
        this.channel.untrack().catch(() => {});
      }
      supabase.removeChannel(this.channel).catch(() => {});
      this.channel = null;
      this.isTracking = false;
    }
    this.onlineUsers.clear();
    this.hiddenUsers.clear();
    this.currentUserId = null;
  }
}

export const globalPresenceManager = new GlobalPresenceManager();

