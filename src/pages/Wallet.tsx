import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

/**
 * Wallet — /wallet
 * Creator-only. Renders inside AppShell.
 * Phase 9 will build full earnings dashboard.
 */
export default function Wallet() {
  const { isCreator, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) return null;
  if (!isCreator) return <Navigate to="/" replace />;

  return (
    <div className="flex-1 overflow-y-auto pb-24 md:pb-8">
      <div className="max-w-[600px] mx-auto w-full min-h-full px-4 sm:px-5 pt-0 pb-10">
        {/* Header matching Stories/Home page */}
        <div className="sticky top-0 z-30 -mx-4 sm:-mx-5 mb-6 flex items-center gap-3.5 bg-ink/95 px-4 py-3.5 backdrop-blur-md sm:px-5 border-b border-border-subtle">
          <button
            type="button"
            onClick={() => {
              if (window.history.state && window.history.state.idx > 0) {
                navigate(-1);
              } else {
                navigate('/me');
              }
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <h3 className="text-base sm:text-lg font-serif font-semibold text-paper tracking-tight">Wallet</h3>
        </div>
        <div className="h-[60vh] flex items-center justify-center text-center">
          <div>
            <p className="font-serif text-2xl text-paper mb-2">Your earnings</p>
            <p className="text-muted text-sm">Monetization dashboard — Phase 9.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
