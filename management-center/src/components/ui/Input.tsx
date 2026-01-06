import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftElement?: ReactNode;
  rightElement?: ReactNode;
}

export function Input({ label, hint, error, leftElement, rightElement, className = '', id, name, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const inputName = name || inputId;

  return (
    <div className="form-group">
      {label && <label htmlFor={inputId}>{label}</label>}
      <div style={{ position: 'relative' }}>
        {leftElement && (
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1 }}>
            {leftElement}
          </div>
        )}
        <input
          id={inputId}
          name={inputName}
          className={`input ${className}`.trim()}
          style={{ 
            paddingLeft: leftElement ? '40px' : undefined,
            ...rest.style
          }}
          {...rest}
        />
        {rightElement && (
          <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}>
            {rightElement}
          </div>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
      {error && <div className="error-box">{error}</div>}
    </div>
  );
}
