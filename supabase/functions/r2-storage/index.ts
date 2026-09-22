// Velour — r2-storage Edge Function
// Uses aws4fetch (lightweight, Deno-native) instead of the full AWS SDK.
// Browser sends file as base64, function uploads server-to-server to R2.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.19';

const CF_ACCOUNT_ID        = Deno.env.get('CF_ACCOUNT_ID')!;
const R2_ACCESS_KEY_ID     = Deno.env.get('R2_ACCESS_KEY_ID')!;
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')!;
const R2_PUBLIC_URL        = Deno.env.get('R2_PUBLIC_URL')!;
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Lightweight AWS Signature V4 client — native fetch, no checksums, no SDK bloat
const r2 = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  service: 's3',
  region: 'auto',
});

const R2_ENDPOINT = `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const { action } = body;

    // ── ACTION: upload ───────────────────────────────────────────────────────
    // Browser sends file as base64. We upload server-to-server using aws4fetch.
    if (action === 'upload') {
      const { bucket, key, contentType, fileBase64 } = body as {
        action: string;
        bucket: string;
        key: string;
        contentType: string;
        fileBase64: string;
      };

      if (!bucket || !key || !contentType || !fileBase64) {
        return json({ error: 'Missing bucket, key, contentType, or fileBase64' }, 400);
      }
      if (!['velour-public', 'velour-private'].includes(bucket)) {
        return json({ error: 'Invalid bucket' }, 400);
      }

      // Decode base64 → binary
      const binaryString = atob(fileBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // PUT directly to R2 using aws4fetch (native fetch + Sig V4, no checksums)
      const uploadUrl = `${R2_ENDPOINT}/${bucket}/${key}`;
      const uploadRes = await r2.fetch(uploadUrl, {
        method: 'PUT',
        body: bytes,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        console.error('R2 upload failed:', uploadRes.status, errText);
        return json({ error: `R2 upload failed: ${uploadRes.status} ${errText}` }, 500);
      }

      const publicUrl = bucket === 'velour-public'
        ? `${R2_PUBLIC_URL}/${key}`
        : null;

      return json({ key, publicUrl });
    }

    // ── ACTION: download-url ─────────────────────────────────────────────────
    // Returns a signed GET URL for a private attachment.
    if (action === 'download-url') {
      const { key, conversationId } = body as {
        action: string;
        key: string;
        conversationId: string;
      };

      if (!key || !conversationId) return json({ error: 'Missing key or conversationId' }, 400);

      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('id, fan_id')
        .eq('id', conversationId)
        .single();

      if (convError || !conversation) return json({ error: 'Conversation not found' }, 404);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const isCreator = profile?.role === 'creator' || profile?.role === 'admin';
      const isFan = conversation.fan_id === user.id;
      if (!isCreator && !isFan) return json({ error: 'Access denied' }, 403);

      // Generate presigned GET URL using aws4fetch
      const expiresIn = 3600;
      const signedUrl = await r2.sign(
        new Request(`${R2_ENDPOINT}/velour-private/${key}`, { method: 'GET' }),
        { aws: { signQuery: true }, headers: {}, expiresIn },
      );

      return json({ signedUrl: signedUrl.url });
    }

    return json({ error: 'Unknown action' }, 400);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('r2-storage error:', message);
    return json({ error: message }, 500);
  }
});
