import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CreatorProfilePanel from '../components/creator/CreatorProfilePanel';

export default function PublicProfile() {
  const { username, creatorId } = useParams<{ username?: string; creatorId?: string }>();
  const navigate = useNavigate();

  return (
    <div className="h-full w-full overflow-y-auto overscroll-y-contain">
      <CreatorProfilePanel
        username={username}
        creatorId={creatorId}
        onBack={() => {
          if (window.history.state && window.history.state.idx > 0) {
            navigate(-1);
          } else {
            navigate('/explore');
          }
        }}
      />
    </div>
  );
}
