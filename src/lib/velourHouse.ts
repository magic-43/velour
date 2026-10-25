import { supabase } from './supabase';
import { uploadPublicFile } from './r2';
import { captureVideoThumbnail } from './videoThumbnail';
import type { CreatorProfile, Story } from '../types';

export const VELOUR_HOUSE_NAME = 'Velour House';
export const VELOUR_HOUSE_AVATAR = '/icons/icon-192.png';

/**
 * Retrieves or creates the official Velour House creator profile.
 */
export async function getOrCreateVelourHouseProfile(ownerId?: string): Promise<CreatorProfile> {
  // 1. Try to find existing profile
  const { data: existing, error: findErr } = await supabase
    .from('creator_profiles')
    .select(`
      id,
      owner_id,
      display_name,
      bio,
      avatar_url,
      cover_url,
      category,
      tags,
      is_verified,
      is_active,
      created_at
    `)
    .eq('display_name', VELOUR_HOUSE_NAME)
    .maybeSingle();

  if (!findErr && existing) {
    return existing as CreatorProfile;
  }

  // 2. If not found, resolve owner ID (either passed in, or current auth user, or fallback admin)
  let resolvedOwnerId = ownerId;
  if (!resolvedOwnerId) {
    const { data: authData } = await supabase.auth.getUser();
    resolvedOwnerId = authData.user?.id;
  }

  if (!resolvedOwnerId) {
    // Look up an admin profile
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();
    resolvedOwnerId = adminProfile?.id;
  }

  if (!resolvedOwnerId) {
    throw new Error('Cannot create Velour House profile: No admin owner identified.');
  }

  const { data: created, error: createErr } = await supabase
    .from('creator_profiles')
    .insert({
      owner_id: resolvedOwnerId,
      display_name: VELOUR_HOUSE_NAME,
      bio: 'The Official Sanctuary of Desire. Exclusive stories, house guides, and drops.',
      avatar_url: VELOUR_HOUSE_AVATAR,
      category: 'Official',
      tags: ['official', 'guide', 'house_of_desire'],
      is_verified: true,
      is_active: true,
    })
    .select()
    .single();

  if (createErr || !created) {
    // If concurrent insert occurred, try fetching one more time
    const { data: retry } = await supabase
      .from('creator_profiles')
      .select('*')
      .eq('display_name', VELOUR_HOUSE_NAME)
      .maybeSingle();
    if (retry) return retry as CreatorProfile;

    throw new Error(`Failed to create Velour House profile: ${createErr?.message}`);
  }

  return created as CreatorProfile;
}

/**
 * Fetch all unexpired stories for Velour House.
 */
export async function fetchVelourHouseStories(): Promise<Story[]> {
  try {
    const { data: vh } = await supabase
      .from('creator_profiles')
      .select('id')
      .eq('display_name', VELOUR_HOUSE_NAME)
      .maybeSingle();

    if (!vh) return [];

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('creator_profile_id', vh.id)
      .order('published_at', { ascending: false });

    if (error || !data) return [];

    // Filter stories that have not expired (within 24 hours)
    const nowTime = Date.now();
    return data.filter((s: any) => {
      if (s.expires_at) {
        return new Date(s.expires_at).getTime() > nowTime;
      }
      if (s.published_at) {
        return nowTime - new Date(s.published_at).getTime() < 24 * 60 * 60 * 1000;
      }
      return false;
    }) as Story[];
  } catch (err) {
    console.warn('Error fetching Velour House stories:', err);
    return [];
  }
}

/**
 * Upload and post a story as Velour House with a 24-hour expiration window.
 */
export async function uploadVelourHouseStory({
  file,
  mediaType,
  caption,
  ownerId,
}: {
  file: File;
  mediaType: 'image' | 'video';
  caption?: string;
  ownerId?: string;
}): Promise<Story> {
  const profile = await getOrCreateVelourHouseProfile(ownerId);
  const baseId = crypto.randomUUID();
  const ext = file.name.split('.').pop() || (mediaType === 'image' ? 'jpg' : 'mp4');
  const key = `stories/${profile.id}/${baseId}_hd.${ext}`;

  // 1. Upload media to R2
  const publicUrl = await uploadPublicFile(file, key, { skipCompression: true });

  // 2. Thumbnail
  let finalThumbnailUrl: string | null = null;
  if (mediaType === 'image') {
    finalThumbnailUrl = publicUrl;
  } else {
    try {
      const thumbFile = await captureVideoThumbnail(file);
      if (thumbFile) {
        const thumbKey = `stories/${profile.id}/${baseId}_thumb.jpg`;
        finalThumbnailUrl = await uploadPublicFile(thumbFile, thumbKey, { skipCompression: true });
      }
    } catch (err) {
      console.warn('Video thumbnail capture failed:', err);
    }
  }

  // 3. Stamped with 24 hours expiration
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const insertPayload: Record<string, any> = {
    creator_profile_id: profile.id,
    media_url: publicUrl,
    thumbnail_url: finalThumbnailUrl,
    media_type: mediaType,
    caption: caption?.trim() || null,
    published_at: now.toISOString(),
    expires_at: expiresAt,
    view_count: 0,
    is_hd: true,
  };

  let { data, error } = await supabase
    .from('stories')
    .insert(insertPayload)
    .select()
    .single();

  if (error && (error.message?.includes('is_hd') || error.code === '42703')) {
    delete insertPayload.is_hd;
    const retry = await supabase.from('stories').insert(insertPayload).select().single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    throw new Error(error?.message || 'Failed to publish Velour House story');
  }

  return data as Story;
}

/**
 * Delete a Velour House story.
 */
export async function deleteVelourHouseStory(storyId: string): Promise<void> {
  const { error } = await supabase.from('stories').delete().eq('id', storyId);
  if (error) throw error;
}

/**
 * 1-Click Seed for the Official House Guide Story Reel (valid 24h).
 */
export async function seedOfficialHouseGuide(ownerId?: string): Promise<Story[]> {
  const profile = await getOrCreateVelourHouseProfile(ownerId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const guideCards = [
    {
      media_url: '/images/1.jpeg',
      thumbnail_url: '/images/1.jpeg',
      media_type: 'image' as const,
      caption: 'Welcome to Velour · The House of Desire. An intimate sanctuary where discretion meets art.',
      offsetSeconds: 0,
    },
    {
      media_url: '/images/2.jpeg',
      thumbnail_url: '/images/2.jpeg',
      media_type: 'image' as const,
      caption: 'Ephemeral 24h Moments. Live creator drops disappear after 24 hours — cherish them in real time.',
      offsetSeconds: 1,
    },
    {
      media_url: '/images/3.jpeg',
      thumbnail_url: '/images/3.jpeg',
      media_type: 'image' as const,
      caption: 'Private Vaults & Direct Chat. Connect with creators on your terms with absolute discretion.',
      offsetSeconds: 2,
    },
  ];

  const results: Story[] = [];

  for (const card of guideCards) {
    const cardPublishedAt = new Date(now.getTime() + card.offsetSeconds * 1000).toISOString();
    const insertPayload: Record<string, any> = {
      creator_profile_id: profile.id,
      media_url: card.media_url,
      thumbnail_url: card.thumbnail_url,
      media_type: card.media_type,
      caption: card.caption,
      published_at: cardPublishedAt,
      expires_at: expiresAt,
      view_count: 0,
      is_hd: true,
    };

    let { data, error } = await supabase.from('stories').insert(insertPayload).select().single();
    if (error && (error.message?.includes('is_hd') || error.code === '42703')) {
      delete insertPayload.is_hd;
      const retry = await supabase.from('stories').insert(insertPayload).select().single();
      data = retry.data;
      error = retry.error;
    }

    if (!error && data) {
      results.push(data as Story);
    }
  }

  return results;
}
