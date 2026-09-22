import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RotateCcw } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useCreatorProfiles } from '../lib/hooks/useCreatorProfiles';
import { useStories } from '../lib/hooks/useStories';
import { supabase } from '../lib/supabase';
import HomeStoryFeed from '../components/stories/HomeStoryFeed';
import CreateStoryModal from '../components/stories/CreateStoryModal';
import MyStatusView from '../components/stories/MyStatusView';

export default function Feed() {
  const { user, isCreator } = useAuth();
  const { activeCreatorProfile } = useCreatorProfiles();
  const navigate = useNavigate();
  const { sessions, loading, postStory, postStoryBatch, deleteStory, updateStoryCaption, markStoryViewed } = useStories();

  const [activeHomeSessionIndex, setActiveHomeSessionIndex] = useState<number | null>(null);
  const [activeHomeSlideIndex, setActiveHomeSlideIndex] = useState(0);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewingMyStatus, setViewingMyStatus] = useState(false);

  const homeGridRef = useRef<HTMLDivElement | null>(null);
  const homeGridScrollTopRef = useRef(0);

  // Check if current user has an active story session
  const mySessionIndex = sessions.findIndex(
    (s) => (activeCreatorProfile && s.creator.id === activeCreatorProfile.id) || (user && s.creator.owner_id === user.id)
  );
  const mySession = mySessionIndex >= 0 ? sessions[mySessionIndex] : null;

  useEffect(() => {
    if (activeHomeSessionIndex === null && !viewingMyStatus) {
      requestAnimationFrame(() => {
        if (!homeGridRef.current) return;
        homeGridRef.current.scrollTop = homeGridScrollTopRef.current;
      });
    }
  }, [activeHomeSessionIndex, viewingMyStatus]);

  // If creator deletes all stories while in status view, return to feed
  useEffect(() => {
    if (viewingMyStatus && !mySession) {
      setViewingMyStatus(false);
    }
  }, [viewingMyStatus, mySession]);

  const handleHomeGridScroll = () => {
    if (!homeGridRef.current) return;
    homeGridScrollTopRef.current = homeGridRef.current.scrollTop;
  };

  const openHomeSession = (sessionIndex: number) => {
    if (homeGridRef.current) {
      homeGridScrollTopRef.current = homeGridRef.current.scrollTop;
    }
    const targetSession = sessions[sessionIndex];
    const resumeIndex = targetSession?.firstUnviewedIndex ?? 0;
    setActiveHomeSessionIndex(sessionIndex);
    setActiveHomeSlideIndex(resumeIndex);
  };

  const handleMessage = async (creatorProfileId: string) => {
    if (!user) {
      navigate('/auth');
      return;
    }

    try {
      const { data: convId, error } = await supabase.rpc('get_or_create_conversation', {
        p_creator_profile_id: creatorProfileId,
      });

      if (!error && convId) {
        setActiveHomeSessionIndex(null);
        navigate(`/messages/${convId}`);
      } else {
        console.error('Failed to open chat:', error);
      }
    } catch (err) {
      console.error('Error opening chat from Feed:', err);
    }
  };

  return (
    <div className="h-full relative overflow-hidden">
      {activeHomeSessionIndex !== null ? (
        /* In-Feed Story Viewer (Overlaps mobile bottom nav on mobile, remains strictly in-column on desktop) */
        <div className="fixed inset-0 z-[100] md:absolute md:inset-0 md:z-50 bg-ink overflow-hidden">
          <HomeStoryFeed
            sessions={sessions}
            userId={user?.id}
            initialSessionIndex={activeHomeSessionIndex}
            initialSlideIndex={activeHomeSlideIndex}
            onPositionChange={(sessionIndex, slideIndex) => {
              setActiveHomeSessionIndex(sessionIndex);
              setActiveHomeSlideIndex(slideIndex);
            }}
            onClose={() => setActiveHomeSessionIndex(null)}
            onMessage={handleMessage}
            onDeleteStory={deleteStory}
            onStoryViewed={markStoryViewed}
          />
        </div>
      ) : viewingMyStatus && activeCreatorProfile ? (
        /* WhatsApp-Style Creator Story Page */
        <MyStatusView
          stories={mySession ? mySession.stories : []}
          creatorProfile={activeCreatorProfile}
          onBack={() => setViewingMyStatus(false)}
          onSelectStory={(slideIndex) => {
            if (mySessionIndex >= 0) {
              setActiveHomeSessionIndex(mySessionIndex);
              setActiveHomeSlideIndex(slideIndex);
            }
          }}
          onDeleteStory={deleteStory}
          onUpdateCaption={updateStoryCaption}
          onAddStory={() => setCreateModalOpen(true)}
        />
      ) : (
        <div
          ref={homeGridRef}
          onScroll={handleHomeGridScroll}
          className="h-full overflow-y-auto px-4 sm:px-5 pt-0 pb-24 md:pb-8"
        >
          {/* Header */}
          <div className="sticky top-0 z-20 -mx-4 sm:-mx-5 mb-4 flex items-center justify-between gap-3 bg-ink/95 px-4 py-3 backdrop-blur-md sm:px-5 border-b border-border-subtle">
            <h3 className="text-sm font-medium text-muted tracking-wide uppercase">Stories</h3>
            {isCreator && (
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold hover:bg-gold-light text-ink text-xs font-semibold tracking-wide transition-colors shadow-sm cursor-pointer"
              >
                <Plus size={14} strokeWidth={2.5} />
                <span>Post Story</span>
              </button>
            )}
          </div>

          {/* Stories Grid */}
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sessions.length === 0 && !isCreator ? (
            <div className="h-[60vh] flex items-center justify-center text-center px-6">
              <div>
                <p className="font-serif text-2xl text-paper mb-2">No stories</p>
                <p className="text-sm text-muted">Story sessions will appear here when creators post.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {/* Creator with 0 active stories: Dedicated Pinned Post Story Card */}
              {isCreator && activeCreatorProfile && !mySession && (
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="w-full text-left relative aspect-[9/12] rounded-xl overflow-hidden group cursor-pointer border-2 border-dashed border-gold/40 hover:border-gold bg-gradient-to-b from-[#181615] to-[#0f0e11] shadow-sm transition-all hover:scale-[1.02] flex flex-col justify-between p-4"
                >
                  {/* Top Avatar with Gold Plus */}
                  <div className="flex items-center justify-between w-full">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full border-2 border-gold p-[2px] shadow-lg bg-ink">
                        {activeCreatorProfile.avatar_url ? (
                          <img
                            src={activeCreatorProfile.avatar_url}
                            alt={activeCreatorProfile.display_name}
                            className="w-full h-full rounded-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full rounded-full bg-gold/20 flex items-center justify-center text-gold font-serif font-bold text-sm">
                            {activeCreatorProfile.display_name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-gold text-ink flex items-center justify-center shadow-md">
                        <Plus size={11} strokeWidth={3} />
                      </div>
                    </div>

                    {/* Card Top Right Action for Empty State Card */}
                  </div>

                  {/* Center Plus Graphic */}
                  <div className="flex flex-col items-center justify-center text-center my-auto">
                    <div className="w-10 h-10 rounded-full bg-gold/10 group-hover:bg-gold/20 border border-gold/30 text-gold flex items-center justify-center transition-colors mb-2 shadow-sm">
                      <Plus size={20} strokeWidth={2.5} />
                    </div>
                    <p className="text-xs font-medium text-paper/90">Add to your story</p>
                  </div>

                  {/* Bottom labels */}
                  <div>
                    <p className="text-paper font-serif font-medium text-sm leading-tight drop-shadow-md">
                      You
                    </p>
                    <p className="text-[0.62rem] text-gold uppercase tracking-wider font-semibold mt-0.5">
                      Share a moment
                    </p>
                  </div>
                </button>
              )}

              {/* Feed Story Sessions */}
              {sessions.map((session, index) => {
                const isMyCard =
                  Boolean(activeCreatorProfile && session.creator.id === activeCreatorProfile.id) ||
                  Boolean(user && session.creator.owner_id === user.id);

                const previewStory =
                  session.stories[session.stories.length - 1] ||
                  session.archivedStories[session.archivedStories.length - 1] ||
                  null;
                const cover =
                  previewStory?.thumbnail_url ||
                  (previewStory?.media_type === 'image' ? previewStory.media_url : null);

                return (
                  <div
                    key={session.creator.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (isMyCard) {
                        setViewingMyStatus(true);
                      } else {
                        openHomeSession(index);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (isMyCard) {
                          setViewingMyStatus(true);
                        } else {
                          openHomeSession(index);
                        }
                      }
                    }}
                    className={`w-full text-left relative aspect-[9/12] rounded-xl overflow-hidden group cursor-pointer shadow-sm transition-transform hover:scale-[1.02] select-none ${
                      isMyCard
                        ? 'border-2 border-gold shadow-lg shadow-gold/15 ring-2 ring-gold/40 ring-offset-2 ring-offset-black'
                        : !session.isAllViewed
                        ? 'border-2 border-gold shadow-md shadow-gold/10'
                        : 'border border-[#262626] hover:border-white/25'
                    }`}
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt={isMyCard ? 'Your story' : session.creator.display_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-ink-light to-ink" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-ink/20 via-transparent to-ink/90" />

                    {/* Watch Again Overlay for fully viewed creator stories */}
                    {!isMyCard && session.isAllViewed && (
                      <div className="absolute inset-0 bg-black/65 backdrop-blur-[1.5px] flex flex-col items-center justify-center p-3 text-center z-[2] transition-colors group-hover:bg-black/55">
                        <div className="w-11 h-11 rounded-full bg-white/10 group-hover:bg-white/20 border border-white/20 flex items-center justify-center text-white mb-2 shadow-lg transition-all duration-300 group-hover:scale-110">
                          <RotateCcw size={18} strokeWidth={2.4} className="group-hover:-rotate-45 transition-transform duration-300" />
                        </div>
                        <span className="text-white font-semibold text-xs tracking-wide drop-shadow-md">
                          Watch Again
                        </span>
                      </div>
                    )}

                    {/* Avatar Ring without badge */}
                    <div className="absolute top-2.5 left-2.5 z-[3]">
                      <div
                        className={`w-9 h-9 rounded-full border-[2px] ${
                          isMyCard || !session.isAllViewed
                            ? 'border-gold ring-1 ring-gold/30'
                            : 'border-white/30'
                        } p-[2px] shadow-lg`}
                      >
                        <div className="w-full h-full rounded-full overflow-hidden bg-ink">
                          {session.creator.avatar_url && (
                            <img
                              src={session.creator.avatar_url}
                              alt={session.creator.display_name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Creator Action for 'You' Card (Add Story Only) */}
                    {isMyCard && (
                      <div className="absolute top-2.5 right-2.5 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCreateModalOpen(true);
                          }}
                          className="w-7 h-7 rounded-full bg-gold hover:bg-gold-light text-ink flex items-center justify-center transition-colors shadow-md cursor-pointer"
                          title="Add story"
                        >
                          <Plus size={13} strokeWidth={2.5} />
                        </button>
                      </div>
                    )}

                    {/* Card Footer */}
                    <div className="absolute bottom-0 left-0 right-0 p-3 z-[3]">
                      <p className="text-paper font-serif font-medium text-sm leading-tight drop-shadow-md truncate flex items-center gap-1.5">
                        <span>{isMyCard ? 'You' : session.creator.display_name}</span>
                        {isMyCard && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                        )}
                      </p>
                      <p className="text-[0.58rem] uppercase tracking-wider font-semibold mt-1">
                        {isMyCard ? (
                          <span className="text-gold">
                            {session.stories.length} {session.stories.length === 1 ? 'story' : 'stories'}
                            <span className="text-muted lowercase ml-1">• your story</span>
                          </span>
                        ) : !session.isAllViewed ? (
                          <>
                            <span className="text-gold font-bold">{session.unviewedCount} new</span>
                            <span className="text-muted lowercase ml-1">• {session.stories.length} total</span>
                          </>
                        ) : (
                          <span className="text-white/60 font-medium">
                            {session.stories.length} {session.stories.length === 1 ? 'story' : 'stories'} • Seen
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Creator Post Story Modal */}
      {createModalOpen && (
        <CreateStoryModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onPost={postStory}
          onPostBatch={postStoryBatch}
        />
      )}
    </div>
  );
}
