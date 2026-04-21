import React, { useState, useRef, useEffect } from 'react';

interface InfoTipProps {
  text: string;
}

export function InfoTip({ text }: InfoTipProps) {
  const [show, setShow] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show) return;
    const handler = (e: MouseEvent) => {
      if (tipRef.current && !tipRef.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [show]);

  return (
    <span className="relative inline-flex ml-1 align-middle" ref={tipRef}>
      <button
        type="button"
        className="text-gray-400 hover:text-primary-500 transition-colors focus:outline-none"
        onClick={() => setShow(!show)}
        aria-label="More info"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 p-2 rounded-lg shadow-lg bg-gray-800 dark:bg-gray-700 text-[11px] leading-relaxed text-gray-100 border border-gray-600">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 rotate-45 bg-gray-800 dark:bg-gray-700 border-r border-b border-gray-600" />
        </div>
      )}
    </span>
  );
}
