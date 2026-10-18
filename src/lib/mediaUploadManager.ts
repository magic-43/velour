import { supabase } from './supabase';
import { appendCachedMessage, updateCachedMessage, deleteCachedMessage } from './offline/db';
import type { MessageWithSender } from './hooks/useMessages';

export interface ActiveMediaUpload {
  tempId: string;
  conversationId: string;
  userId: string;
  tempMessage: MessageWithSender;
  status: 'sending' | 'completed' | 'failed';
  error?: string | null;
  promise: Promise<MessageWithSender | null>;
  retry?: () => Promise<MessageWithSender | null>;
}

class MediaUploadManager {
  private activeUploads = new Map<string, ActiveMediaUpload>();

  /**
   * Returns all active in-flight or failed uploads, optionally filtered by conversationId.
   */
  public getActiveUploads(conversationId?: string): MessageWithSender[] {
    const list: MessageWithSender[] = [];
    for (const item of this.activeUploads.values()) {
      if (!conversationId || item.conversationId === conversationId) {
        list.push({ ...item.tempMessage, status: item.status === 'completed' ? 'sent' : item.status });
      }
    }
    return list;
  }

  /**
   * Returns a specific active upload record by tempId.
   */
  public getActiveUpload(tempId: string): ActiveMediaUpload | undefined {
    return this.activeUploads.get(tempId);
  }

  /**
   * Checks if any upload is currently in-flight for a conversation.
   */
  public isUploading(conversationId: string): boolean {
    for (const item of this.activeUploads.values()) {
      if (item.conversationId === conversationId && item.status === 'sending') {
        return true;
      }
    }
    return false;
  }

  /**
   * Starts a background media upload task that lives independently of any React component.
   */
  public startUpload(params: {
    tempId: string;
    conversationId: string;
    userId: string;
    tempMessage: MessageWithSender;
    uploadFn: () => Promise<string | null>;
    replyToId?: string | null;
  }): Promise<MessageWithSender | null> {
    const { tempId, conversationId, userId, tempMessage, uploadFn, replyToId } = params;

    // 1. Immediately cache the temp sending placeholder in IndexedDB
    appendCachedMessage(tempMessage).catch((err) => {
      console.warn('Failed saving optimistic media message to cache:', err);
    });

    // 2. Wrap the background upload task
    const promise = (async (): Promise<MessageWithSender | null> => {
      try {
        const finalContent = await uploadFn();
        if (!finalContent) {
          throw new Error('Upload returned empty content or was cancelled');
        }

        // 3. Insert confirmed message into Supabase
        const { data, error } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: userId,
            sender_type: tempMessage.sender_type,
            content: finalContent,
            message_type: 'text',
            reply_to_id: replyToId || null,
          })
          .select(`*, sender:profiles!sender_id(id, username, display_name, avatar_url)`)
          .single();

        if (error || !data) {
          throw error || new Error('Failed to insert confirmed media message into database');
        }

        const confirmed = data as MessageWithSender;
        if (tempMessage.reply_to && !confirmed.reply_to) {
          confirmed.reply_to = tempMessage.reply_to;
        }

        // 4. Update cache: replace temp row with confirmed row
        await updateCachedMessage(tempId, confirmed);

        // 5. Clean up from in-memory active uploads
        this.activeUploads.delete(tempId);

        // 6. Broadcast event so any active chat view swaps the message instantly
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('velour:media_upload_complete', {
              detail: {
                tempId,
                confirmed,
                conversationId,
              },
            })
          );
        }

        return confirmed;
      } catch (err: any) {
        console.error(`Background media upload failed for ${tempId}:`, err);

        const record = this.activeUploads.get(tempId);
        if (record) {
          record.status = 'failed';
          record.error = err?.message || 'Upload failed';
          record.tempMessage = { ...record.tempMessage, status: 'failed' };
        }

        // Save failed status to cache so returning to chat displays the failed state
        const failedMsg: MessageWithSender = { ...tempMessage, status: 'failed' };
        updateCachedMessage(tempId, failedMsg).catch(() => {});

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('velour:media_upload_failed', {
              detail: {
                tempId,
                conversationId,
                error: err?.message || 'Upload failed',
              },
            })
          );
        }

        return null;
      }
    })();

    const activeItem: ActiveMediaUpload = {
      tempId,
      conversationId,
      userId,
      tempMessage,
      status: 'sending',
      promise,
      retry: () => this.startUpload(params),
    };

    this.activeUploads.set(tempId, activeItem);

    return promise;
  }

  /**
   * Cancel or remove an active/failed upload.
   */
  public cancelOrRemove(tempId: string) {
    this.activeUploads.delete(tempId);
    deleteCachedMessage(tempId).catch(() => {});
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('velour:media_upload_cancelled', {
          detail: { tempId },
        })
      );
    }
  }
}

export const mediaUploadManager = new MediaUploadManager();
