import { useState, useEffect, useMemo } from 'react';
import { X, Search, Check, ChevronLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { AudienceSettings, StoryAudienceType, Profile } from '../../types';

interface StoryAudienceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: AudienceSettings;
  onSave: (settings: AudienceSettings) => void;
}

const AVATAR_COLORS = [
  'bg-gold/80 text-ink',
  'bg-emerald-600 text-white',
  'bg-blue-600 text-white',
  'bg-amber-600 text-white',
  'bg-rose-600 text-white',
  'bg-purple-600 text-white',
  'bg-indigo-600 text-white',
  'bg-teal-600 text-white',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function StoryAudienceModal({
  isOpen,
  onClose,
  currentSettings,
  onSave,
}: StoryAudienceModalProps) {
  const [selectedType, setSelectedType] = useState<StoryAudienceType>(currentSettings.type);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set(currentSettings.userIds)
  );
  const [step, setStep] = useState<'options' | 'pick_users'>('options');
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState<Profile[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);

  // Sync state whenever opened
  useEffect(() => {
    if (isOpen) {
      setSelectedType(currentSettings.type);
      setSelectedUserIds(new Set(currentSettings.userIds));
      setStep('options');
      setSearchQuery('');
    }
  }, [isOpen, currentSettings]);

  // Load followers/clients for the exclusion/inclusion pickers
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadFollowers() {
      setLoadingClients(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, role, bio, is_banned, last_seen_at, created_at, email')
          .eq('role', 'fan')
          .eq('is_banned', false)
          .order('display_name', { ascending: true })
          .limit(100);

        if (!error && data && isMounted) {
          setClients(data as Profile[]);
        }
      } catch (err) {
        console.error('Failed to load audience list:', err);
      } finally {
        if (isMounted) setLoadingClients(false);
      }
    }

    loadFollowers();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleUser = (userId: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setSelectedUserIds(next);
  };

  const handleSelectAll = () => {
    const all = new Set(clients.map((c) => c.id));
    setSelectedUserIds(all);
  };

  const handleClearAll = () => {
    setSelectedUserIds(new Set());
  };

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const q = searchQuery.toLowerCase().trim();
    return clients.filter(
      (c) =>
        c.username.toLowerCase().includes(q) ||
        (c.display_name && c.display_name.toLowerCase().includes(q))
    );
  }, [clients, searchQuery]);

  const handleSelectOption = (type: StoryAudienceType) => {
    setSelectedType(type);
    if (type === 'all') {
      setSelectedUserIds(new Set());
      onSave({ type: 'all', userIds: [] });
    } else {
      setStep('pick_users');
    }
  };

  const handleConfirmUsers = () => {
    onSave({
      type: selectedType,
      userIds: selectedType === 'all' ? [] : Array.from(selectedUserIds),
    });
    setStep('options');
  };

  const handleSaveAndClose = () => {
    onSave({
      type: selectedType,
      userIds: selectedType === 'all' ? [] : Array.from(selectedUserIds),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-sans">
      <div className="relative w-full max-w-sm bg-ink border border-border-subtle rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center gap-3.5 px-5 py-4 border-b border-border-subtle shrink-0 bg-ink-light/80">
          {step === 'pick_users' ? (
            <button
              type="button"
              onClick={() => setStep('options')}
              className="text-muted hover:text-paper transition-colors"
            >
              <ChevronLeft size={22} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="text-muted hover:text-paper transition-colors"
            >
              <X size={20} />
            </button>
          )}

          <h3 className="text-[17px] font-semibold text-paper leading-tight">
            {step === 'options'
              ? 'Status privacy'
              : selectedType === 'exclude'
              ? 'Hide status from...'
              : 'Share status with...'}
          </h3>
        </div>

        {/* Body */}
        {step === 'options' ? (
          <div className="p-5 flex-1 overflow-y-auto">
            <p className="text-xs font-semibold tracking-wide text-gold mb-4 uppercase">
              Who can see my statuses
            </p>

            <div className="space-y-5">
              {/* Option 1: My contacts */}
              <button
                type="button"
                onClick={() => handleSelectOption('all')}
                className="w-full text-left flex items-start gap-3.5 py-1 group cursor-pointer"
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center transition-all ${
                    selectedType === 'all'
                      ? 'border-gold text-gold'
                      : 'border-zinc-600 group-hover:border-zinc-400'
                  }`}
                >
                  {selectedType === 'all' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-gold" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-paper leading-tight">
                    My contacts
                  </p>
                  <p className="text-xs text-muted mt-1">
                    Share with all of your contacts
                  </p>
                </div>
              </button>

              {/* Option 2: My contacts except... */}
              <button
                type="button"
                onClick={() => handleSelectOption('exclude')}
                className="w-full text-left flex items-start gap-3.5 py-1 group cursor-pointer"
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center transition-all ${
                    selectedType === 'exclude'
                      ? 'border-gold text-gold'
                      : 'border-zinc-600 group-hover:border-zinc-400'
                  }`}
                >
                  {selectedType === 'exclude' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-gold" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-paper leading-tight">
                    My contacts except...
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {selectedType === 'exclude' && selectedUserIds.size > 0
                      ? `${selectedUserIds.size} contacts excluded`
                      : 'Choose contacts to exclude'}
                  </p>
                </div>
              </button>

              {/* Option 3: Only share with... */}
              <button
                type="button"
                onClick={() => handleSelectOption('include')}
                className="w-full text-left flex items-start gap-3.5 py-1 group cursor-pointer"
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center transition-all ${
                    selectedType === 'include'
                      ? 'border-gold text-gold'
                      : 'border-zinc-600 group-hover:border-zinc-400'
                  }`}
                >
                  {selectedType === 'include' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-gold" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-paper leading-tight">
                    Only share with...
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {selectedType === 'include' && selectedUserIds.size > 0
                      ? `${selectedUserIds.size} contacts selected`
                      : 'Only share with selected contacts'}
                  </p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* User Picker View */
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Search capsule */}
            <div className="px-5 pt-3 pb-2">
              <div className="relative flex items-center">
                <Search
                  size={15}
                  className="absolute left-3.5 text-muted pointer-events-none"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search contacts..."
                  className="w-full h-9 pl-9 pr-8 bg-[#18181b] text-paper text-sm rounded-full placeholder-muted focus:outline-none focus:ring-1 focus:ring-gold/60 border border-border-subtle transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 text-muted hover:text-paper"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Quick action bar */}
              <div className="flex items-center justify-between mt-2.5 px-1 text-xs">
                <span className="text-muted">
                  {selectedUserIds.size} of {clients.length} selected
                </span>
                <div className="flex gap-3 text-gold">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="hover:underline font-medium"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="hover:underline text-muted hover:text-paper"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-5 py-2 divide-y divide-border-subtle">
              {loadingClients ? (
                <div className="py-12 flex justify-center">
                  <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted">
                  No contacts found.
                </div>
              ) : (
                filteredClients.map((client) => {
                  const isChecked = selectedUserIds.has(client.id);
                  const name = client.display_name || client.username;
                  return (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => toggleUser(client.id)}
                      className="w-full flex items-center justify-between py-2.5 px-1 text-left group hover:bg-white/[0.03] transition-colors rounded-lg"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full overflow-hidden shrink-0">
                          {client.avatar_url ? (
                            <img
                              src={client.avatar_url}
                              alt={name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className={`w-full h-full ${getAvatarColor(
                                name
                              )} flex items-center justify-center text-sm font-medium`}
                            >
                              {name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-paper truncate">{name}</p>
                          <p className="text-xs text-muted truncate">@{client.username}</p>
                        </div>
                      </div>

                      {/* Circular Checkbox */}
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                          isChecked
                            ? 'bg-gold border-gold text-ink'
                            : 'border-zinc-600 group-hover:border-zinc-400'
                        }`}
                      >
                        {isChecked && <Check size={12} strokeWidth={3} />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Sub-footer for user picker */}
            <div className="p-3.5 border-t border-border-subtle shrink-0 flex items-center justify-end gap-2 bg-ink-light">
              <button
                type="button"
                onClick={handleConfirmUsers}
                className="px-5 py-2 rounded-xl bg-gold hover:bg-gold-light text-ink text-xs font-semibold uppercase tracking-wider transition-colors shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
