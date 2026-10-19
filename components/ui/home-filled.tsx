/** Solid house with the door cut out (Spotify's active "home" glyph). */
export function HomeFilled({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        d="M12 3.2 3.6 9.8a1 1 0 0 0-.4.8V20a1 1 0 0 0 1 1h4.6v-6.2a1 1 0 0 1 1-1h4.4a1 1 0 0 1 1 1V21h4.6a1 1 0 0 0 1-1v-9.4a1 1 0 0 0-.4-.8Z"
      />
    </svg>
  );
}
