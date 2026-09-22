import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Settings — /settings and /settings/:section
 * Renders inside AppShell.
 * Phase 4 will build each section.
 */
export default function Settings() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();

  const sectionLabel: Record<string, string> = {
    account: 'Account',
    notifications: 'Notifications',
    security: 'Security',
  };

  const label = section ? (sectionLabel[section] ?? 'Settings') : 'Settings';

  return (
    <div className="flex-1 overflow-y-auto pb-24 md:pb-8">
      <div className="max-w-[600px] mx-auto w-full min-h-full px-4 sm:px-5 pt-0 pb-10">
        {/* Header matching Stories/Home page */}
        <div className="sticky top-0 z-20 -mx-4 sm:-mx-5 mb-6 flex items-center gap-3 bg-ink/95 px-4 py-3 backdrop-blur-md sm:px-5 border-b border-border-subtle">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-ink-light transition-colors cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <h3 className="text-sm font-medium text-muted tracking-wide uppercase">{label}</h3>
        </div>
        <div className="bg-ink-light border border-border-subtle rounded-2xl p-6 text-center">
          <p className="text-muted text-sm">{label} settings — Phase 4.</p>
        </div>
      </div>
    </div>
  );
}
