import { supabase } from './supabase';

export interface OtpRequestResult {
  success: boolean;
  message?: string;
  email?: string;
  code?: string;
}

export interface OtpVerifyResult {
  success: boolean;
  message?: string;
  email?: string;
}

/**
 * Request a 6-digit verification code sent to the target recovery email.
 */
export async function requestRecoveryEmailVerification(
  email: string,
  username?: string
): Promise<OtpRequestResult> {
  const cleanEmail = email.trim().toLowerCase();

  try {
    // 1. Call database RPC to securely generate and store 6-digit OTP
    const { data, error } = await supabase.rpc('request_recovery_email_otp', {
      p_email: cleanEmail,
    });

    if (error) {
      // Check if function does not exist yet in DB
      if (error.code === '42883' || error.message?.includes('function public.request_recovery_email_otp')) {
        throw new Error('Database migration pending. Please run create_recovery_email_verifications.sql in Supabase SQL Editor.');
      }
      throw new Error(error.message || 'Failed to generate verification code.');
    }

    const payload = data as { success?: boolean; code?: string; message?: string; email?: string } | null;
    if (!payload || !payload.success) {
      throw new Error(payload?.message || 'Failed to generate verification code.');
    }

    const generatedCode = payload.code;

    // 2. Dispatch email via Supabase Edge Function
    if (generatedCode) {
      try {
        const { error: fnError } = await supabase.functions.invoke('send-recovery-otp', {
          body: {
            email: cleanEmail,
            code: generatedCode,
            username: username || '',
          },
        });

        if (fnError) {
          console.warn('Edge function email dispatch warning (may be dev mode):', fnError);
        }
      } catch (fnErr) {
        console.warn('Could not invoke send-recovery-otp Edge Function:', fnErr);
      }
    }

    return {
      success: true,
      email: cleanEmail,
      code: generatedCode, // Available for development/fallback display if needed
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to send verification code.';
    return {
      success: false,
      message: msg,
    };
  }
}

/**
 * Verify the 6-digit OTP code and update the profile recovery email upon match.
 */
export async function verifyRecoveryEmailCode(
  email: string,
  code: string
): Promise<OtpVerifyResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  try {
    const { data, error } = await supabase.rpc('verify_recovery_email_otp', {
      p_email: cleanEmail,
      p_code: cleanCode,
    });

    if (error) {
      throw new Error(error.message || 'Verification failed. Please try again.');
    }

    const res = data as { success?: boolean; message?: string; email?: string } | null;
    if (!res || !res.success) {
      return {
        success: false,
        message: res?.message || 'Invalid or expired verification code.',
      };
    }

    return {
      success: true,
      email: cleanEmail,
      message: res.message || 'Recovery email verified and updated successfully.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Verification failed.';
    return {
      success: false,
      message: msg,
    };
  }
}
