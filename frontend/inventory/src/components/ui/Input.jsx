import React from 'react';

const Input = ({ label, error, className = '', id, name, ...props }) => {
  const inputId = id || name;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-semibold text-brand-deep">
          {label}
        </label>
      )}
      <input
        id={inputId}
        name={name}
        className={`glass-input ${error ? 'border-error-500 focus:border-error-500 focus:ring-error-500/20' : ''}`}
        {...props}
      />
      {error && <span className="text-sm text-error-500 mt-1 animate-fade-in">{error}</span>}
    </div>
  );
};

export default Input;
