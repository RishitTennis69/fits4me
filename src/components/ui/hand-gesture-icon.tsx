import React from 'react';

interface HandGestureIconProps {
  className?: string;
}

export const HandGestureIcon: React.FC<HandGestureIconProps> = ({ className = "h-6 w-6" }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Hand outline */}
      <path d="M18 8c0-2.21-1.79-4-4-4s-4 1.79-4 4v6c0 2.21 1.79 4 4 4s4-1.79 4-4V8z" />
      
      {/* Thumb */}
      <path d="M6 12c0-1.1.9-2 2-2s2 .9 2 2v2c0 1.1-.9 2-2 2s-2-.9-2-2v-2z" />
      
      {/* Index finger forming circle with thumb */}
      <path d="M10 10c0-.55.45-1 1-1s1 .45 1 1v2c0 .55-.45 1-1 1s-1-.45-1-1v-2z" />
      
      {/* Middle finger */}
      <path d="M12 8c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1s-1-.45-1-1V8z" />
      
      {/* Ring finger */}
      <path d="M14 6c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V6z" />
      
      {/* Pinky finger */}
      <path d="M16 4c0-.55.45-1 1-1s1 .45 1 1v8c0 .55-.45 1-1 1s-1-.45-1-1V4z" />
    </svg>
  );
}; 