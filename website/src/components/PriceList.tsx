import type { PricingOption } from "../data/plans";
import styles from "./PriceList.module.css";

interface PriceListProps {
  options: PricingOption[];
  selectedMonths: number;
  onSelect: (months: number) => void;
}

export function PriceList({ options, selectedMonths, onSelect }: PriceListProps) {
  return (
    <div className={styles.list}>
      {options.map((opt) => {
        const isSelected = selectedMonths === opt.months;
        const perMonth = opt.months > 0 ? Math.round(opt.price / opt.months) : 0;

        return (
          <button
            key={opt.months}
            className={`${styles.option} ${isSelected ? styles.selected : ""}`}
            onClick={() => onSelect(opt.months)}
          >
            <div className={styles.radio} />
            <div className={styles.info}>
              <span className={styles.label}>{opt.label}</span>
              {opt.discount > 0 && (
                <span className={styles.badge}>-{opt.discount}%</span>
              )}
            </div>
            <div className={styles.pricing}>
              <div className={styles.price}>{opt.price} ₽</div>
              {opt.months > 1 && (
                <div className={styles.perMonth}>{perMonth} ₽/мес</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
