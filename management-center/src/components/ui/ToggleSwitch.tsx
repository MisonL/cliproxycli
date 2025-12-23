import { useId, type ChangeEvent, type ReactNode } from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  id?: string;
  name?: string;
}

export function ToggleSwitch({ checked, onChange, label, disabled = false, id, name }: ToggleSwitchProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const inputName = name || inputId;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked);
  };

  return (
    <label className="switch" htmlFor={inputId}>
      <input
        type="checkbox"
        id={inputId}
        name={inputName}
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
      />
      <span className="track">
        <span className="thumb" />
      </span>
      {label && <span className="label">{label}</span>}
    </label>
  );
}
