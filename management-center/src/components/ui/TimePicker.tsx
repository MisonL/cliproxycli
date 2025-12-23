import React, { useState, useEffect, useRef } from 'react';
import styles from './TimePicker.module.scss';
import { IconClock } from './icons';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export const TimePicker: React.FC<TimePickerProps> = ({ value, onChange, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hours, setHours] = useState(value.split(':')[0] || '09');
  const [minutes, setMinutes] = useState(value.split(':')[1] || '00');
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => {
    if (!isOpen) {
      const parts = value.split(':');
      if (parts.length === 2) {
        setHours(parts[0]);
        setMinutes(parts[1]);
      }
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // 延迟一小会儿执行，确保下拉框已渲染完成并应用样式
      setTimeout(() => {
        dropdownRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleApply = () => {
    onChange(`${hours}:${minutes}`);
    setIsOpen(false);
  };

  const hourOptions = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  return (
    <div className={styles.container} ref={containerRef}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={styles.trigger} onClick={handleOpen}>
        <IconClock size={16} className={styles.icon} />
        <span className={styles.value}>{value || '--:--'}</span>
      </div>

      {isOpen && (
        <div className={styles.dropdown} ref={dropdownRef}>
          <div className={styles.pickerGrid}>
            <div className={styles.column}>
              <div className={styles.columnHeader}>HH</div>
              <div className={styles.scrollArea}>
                {hourOptions.map(h => (
                  <div 
                    key={h} 
                    className={`${styles.option} ${hours === h ? styles.selected : ''}`}
                    onClick={() => setHours(h)}
                  >
                    {h}
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.column}>
              <div className={styles.columnHeader}>MM</div>
              <div className={styles.scrollArea}>
                {minuteOptions.map(m => (
                  <div 
                    key={m} 
                    className={`${styles.option} ${minutes === m ? styles.selected : ''}`}
                    onClick={() => setMinutes(m)}
                  >
                    {m}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.footer}>
            <div className={styles.presets}>
              {['09:00', '12:00', '18:00', '21:00'].map(p => (
                <button key={p} className={styles.presetBtn} onClick={() => {
                  const [ph, pm] = p.split(':');
                  setHours(ph);
                  setMinutes(pm);
                }}>{p}</button>
              ))}
            </div>
            <button className={styles.applyBtn} onClick={handleApply}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
};
