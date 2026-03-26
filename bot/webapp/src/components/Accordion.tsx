import { useState } from 'react';
import styles from './Accordion.module.css';

interface AccordionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  iconColor?: string;
}

export function Accordion({ icon, title, children, iconColor }: AccordionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`${styles.accordion} ${open ? styles.open : ''}`}>
      <button className={styles.header} onClick={() => setOpen(!open)}>
        <span
          className={styles.icon}
          style={iconColor ? { background: iconColor } : undefined}
        >
          {icon}
        </span>
        <span className={styles.title}>{title}</span>
        <span className={styles.chevron}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      <div className={styles.body}>
        <div className={styles.bodyInner}>{children}</div>
      </div>
    </div>
  );
}
