import React from 'react';

/** 48px outlined input, radius 12, #85878A border, #B4430F focus ring; label always visible above. */
const Input = ({ label, error, className = '', id, name, ...props }) => {
  const inputId = id || name;
  const errorId = error && inputId ? `${inputId}-error` : undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-medium text-wk-body">
          {label}
        </label>
      )}
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`glass-input ${error ? '!border-error-600 focus:!shadow-[0_0_0_1px_#B42323]' : ''}`}
        {...props}
      />
      {error && <span id={errorId} className="mt-0.5 text-[13px] text-error-600 animate-fade-in">{error}</span>}
    </div>
  );
};

export default Input;
