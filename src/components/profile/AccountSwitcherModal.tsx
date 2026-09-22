import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Check, Plus, Loader2, LogOut, Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import AddAccountModal from './AddAccountModal';
import type { SavedAccount } from '../../lib/multiAccount';

interface AccountSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AccountSwitcherModal({ isOpen, onClose }: AccountSwitcherModalProps) {
  const {
    profile,
    savedAccounts,
    switchSavedAccount,
    removeSavedAccountSession,
    signOut,
  } = useAuth();
  const navigate = useNavigate();

  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Combine saved accounts with current profile to ensure active profile always displays
  const accountsToDisplay: SavedAccount[] = (() => {
    const list = [...savedAccounts];
    if (profile && !list.some((a) => a.userId === profile.id)) {
      list.unshift({
        userId: profile.id,
        username: profile.username,
        displayName: profile.display_name || profile.username,
        avatarUrl: profile.avatar_url || null,
        accessToken: '',
        refreshToken: '',
        lastActiveAt: Date.now(),
      });
    }
    return list;
  })();

  const handleSelectAccount = async (targetUserId: string) => {
    if (profile?.id === targetUserId) {
      onClose();
      return;
    }

    try {
      setError(null);
      setSwitchingId(targetUserId);
      const success = await switchSavedAccount(targetUserId);
      if (success) {
        onClose();
      } else {
        setError('Session expired. Please re-authenticate this account.');
      }
    } catch (err: any) {
      console.error('Account switch failed:', err);
      setError('Failed to switch accounts.');
    } finally {
      setSwitchingId(null);
    }
  };

  const handleLogoutCurrent = async () => {
    if (profile) {
      removeSavedAccountSession(profile.id);
    }
    onClose();
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#161618] border-t sm:border border-white/10 p-5 sm:p-6 shadow-2xl relative max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mobile Drag Handle */}
          <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <h3 className="font-semibold text-base sm:text-lg text-paper tracking-tight">
              Accounts
            </h3>
            <button
              onClick={onClose}
              className="text-muted hover:text-paper p-1 rounded-full transition-colors"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="mt-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl p-2.5">
              {error}
            </div>
          )}

          {/* Accounts List */}
          <div className="py-2 overflow-y-auto space-y-1.5 flex-1 divide-y divide-white/5">
            {accountsToDisplay.map((account) => {
              const isActive = profile?.id === account.userId;
              const isSwitchingThis = switchingId === account.userId;

              return (
                <div
                  key={account.userId}
                  onClick={() => !isSwitchingThis && handleSelectAccount(account.userId)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all cursor-pointer select-none ${
                    isActive
                      ? 'bg-white/[0.04]'
                      : 'hover:bg-white/[0.03] active:scale-[0.99]'
                  }`}
                >
                  {/* Avatar + Name / Handle */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative shrink-0">
                      <div
                        className={`w-11 h-11 rounded-full overflow-hidden flex items-center justify-center bg-ink-light border border-white/10 ${
                          isActive
                            ? 'ring-2 ring-gold ring-offset-2 ring-offset-[#161618]'
                            : ''
                        }`}
                      >
                        {account.avatarUrl ? (
                          <img
                            src={account.avatarUrl}
                            alt={account.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="font-serif text-lg text-gold select-none">
                            {(account.displayName || account.username).charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 text-left">
                      <p className="font-semibold text-sm text-paper truncate leading-snug">
                        {account.displayName || account.username}
                      </p>
                      <p className="text-xs text-muted truncate">
                        @{account.username}
                      </p>
                    </div>
                  </div>

                  {/* Right Status */}
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {isSwitchingThis ? (
                      <Loader2 size={18} className="animate-spin text-gold" />
                    ) : isActive ? (
                      <div className="w-6 h-6 rounded-full bg-gold/15 text-gold flex items-center justify-center">
                        <Check size={14} strokeWidth={2.5} />
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSavedAccountSession(account.userId);
                        }}
                        title="Remove account from device"
                        className="p-1.5 rounded-lg text-muted/40 hover:text-red-400 hover:bg-white/5 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Actions */}
          <div className="pt-3 border-t border-white/10 shrink-0 space-y-2 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
            {/* Add account button */}
            <button
              onClick={() => setAddAccountOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-paper font-medium text-sm transition-all active:scale-[0.99]"
            >
              <Plus size={16} className="text-gold" />
              <span>Add account</span>
            </button>

            {/* Log out of active account */}
            {profile && (
              <button
                onClick={handleLogoutCurrent}
                className="w-full py-2.5 px-3 flex items-center justify-center gap-2 text-xs text-muted hover:text-red-400 transition-colors"
              >
                <LogOut size={13} />
                <span>Log out @{profile.username}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add Account Modal */}
      <AddAccountModal
        isOpen={addAccountOpen}
        onClose={() => setAddAccountOpen(false)}
        onSuccess={() => {
          setAddAccountOpen(false);
          onClose();
        }}
      />
    </>
  );
}
