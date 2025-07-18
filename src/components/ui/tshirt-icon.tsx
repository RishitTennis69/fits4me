import React from 'react';

interface TShirtIconProps {
  className?: string;
}

export const TShirtIcon: React.FC<TShirtIconProps> = ({ className = "h-6 w-6" }) => {
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
      {/* T-shirt outline */}
      <path d="M6 3h12l2 6-2 6H6l-2-6 2-6z" />
      <path d="M6 9h12" />
      <path d="M6 15h12" />
      {/* Sleeves */}
      <path d="M6 9l-2 2v4l2 2" />
      <path d="M18 9l2 2v4l-2 2" />
    </svg>
  );
}; 