import React from 'react';

type Props = {
  selectedAvatar: string | null | undefined;
  onSelect: (avatarUrl: string) => void;
  avatars?: string[];
  columns?: number;
};

const DEFAULT_AVATARS = [
  '/avatars/default.png',
  '/avatars/avatar-1.png',
  '/avatars/avatar-2.png',
  '/avatars/avatar-3.png',
  '/avatars/avatar-4.png',
  '/avatars/avatar-5.png',
];

const AvatarPicker: React.FC<Props> = ({
  selectedAvatar,
  onSelect,
  avatars = DEFAULT_AVATARS,
  columns = 6,
}) => {
  const colsClass =
    columns === 4
      ? 'grid-cols-4'
      : columns === 5
        ? 'grid-cols-5'
        : 'grid-cols-6';

  return (
    <div className={`grid ${colsClass} gap-3 sm:gap-4`}>
      {avatars.map((url) => {
        const selected = (selectedAvatar || '/avatars/default.png') === url;
        return (
          <button
            key={url}
            type="button"
            onClick={() => onSelect(url)}
            className={`group relative rounded-full p-1 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
              selected ? 'ring-2 ring-indigo-500' : 'ring-1 ring-gray-200 dark:ring-white/10'
            }`}
            aria-pressed={selected}
            aria-label={`Select avatar ${url}`}
          >
            <img
              src={url}
              alt=""
              className="h-12 w-12 sm:h-14 sm:w-14 rounded-full object-cover bg-card"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/avatars/default.png';
              }}
            />
            {selected && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white">
                Selected
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default AvatarPicker;
