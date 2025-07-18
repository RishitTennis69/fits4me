import React from 'react';

interface ShirtChainIconProps {
  className?: string;
}

export const ShirtChainIcon: React.FC<ShirtChainIconProps> = ({ className = "h-6 w-6" }) => {
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
      {/* Shirt outline */}
      <path d="M6 3h12l2 6-2 6H6l-2-6 2-6z" />
      <path d="M6 9h12" />
      <path d="M6 15h12" />
      
      {/* Chain links */}
      <path d="M8 6h2v2H8z" />
      <path d="M14 6h2v2h-2z" />
      <path d="M8 12h2v2H8z" />
      <path d="M14 12h2v2h-2z" />
      
      {/* Chain connecting lines */}
      <path d="M10 7h4" />
      <path d="M10 13h4" />
    </svg>
  );
}; 