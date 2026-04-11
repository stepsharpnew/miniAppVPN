import { useState } from "react";
import { PRICING, type PricingOption } from "../data/plans";
import { PURCHASE_PLATFORMS, type PlatformInfo } from "../data/platforms";
import { PlatformSelect } from "../components/PlatformSelect";
import { PriceList } from "../components/PriceList";
import styles from "./PricingPage.module.css";

export function PricingPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformInfo>(
    PURCHASE_PLATFORMS[0],
  );
  const [selected, setSelected] = useState<PricingOption>(PRICING[0]);

  const buttonText = `КУПИТЬ ЗА ${selected.price}₽`;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerIcon}>🛒</div>
        <div>
          <div className={styles.headerTitle}>Тарифы</div>
          <div className={styles.headerSubtitle}>
            Выберите устройство и срок подписки
          </div>
        </div>
      </div>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Ваше устройство</h3>
        <PlatformSelect
          platforms={PURCHASE_PLATFORMS}
          selectedId={selectedPlatform.id}
          onSelect={setSelectedPlatform}
        />

        <h3 className={styles.sectionTitleSpaced}>Тариф</h3>
        <PriceList
          options={PRICING}
          selectedMonths={selected.months}
          onSelect={(m) => {
            const opt = PRICING.find((p) => p.months === m);
            if (opt) setSelected(opt);
          }}
        />

        <div className={styles.buyButtonWrap}>
          <button className={styles.buyButton}>
            {buttonText}
          </button>
          <p className={styles.buyHint}>
            Оплата через сайт — скоро!
            <br />
            Пока доступна через Telegram-бот
          </p>
        </div>
      </section>
    </div>
  );
}
