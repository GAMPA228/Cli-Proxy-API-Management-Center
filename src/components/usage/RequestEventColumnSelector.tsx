import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { IconSlidersHorizontal } from '@/components/ui/icons';
import { REQUEST_EVENT_COLUMNS, type RequestEventColumnId } from '@/utils/usage/requestEventColumns';
import styles from './RequestEventColumnSelector.module.scss';

interface Props {
  hiddenColumns: RequestEventColumnId[];
  onChange: (columns: RequestEventColumnId[]) => void;
}

export function RequestEventColumnSelector({ hiddenColumns, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 300, maxHeight: 440 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const visibleCount = REQUEST_EVENT_COLUMNS.length - hiddenColumns.length;
  const label = t('usage_stats.request_events_columns');

  const positionPopup = useCallback(() => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const width = Math.min(300, window.innerWidth - 24);
    const below = window.innerHeight - trigger.bottom - 20;
    const above = trigger.top - 20;
    const maxHeight = Math.min(440, Math.max(below, above));
    const top =
      below >= Math.min(300, maxHeight)
        ? trigger.bottom + 8
        : Math.max(12, trigger.top - maxHeight - 8);
    setPosition({
      top,
      left: Math.max(12, Math.min(trigger.right - width, window.innerWidth - width - 12)),
      width,
      maxHeight: Math.min(maxHeight, window.innerHeight - top - 12),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    popupRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
    const outsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popupRef.current?.contains(target))
        setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.querySelector('button')?.focus();
    };
    document.addEventListener('mousedown', outsideClick);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup, true);
    return () => {
      document.removeEventListener('mousedown', outsideClick);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', positionPopup);
      window.removeEventListener('scroll', positionPopup, true);
    };
  }, [open, positionPopup]);

  return (
    <div ref={triggerRef} className={styles.selector}>
      <Button
        variant="secondary"
        size="sm"
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        onClick={() => {
          positionPopup();
          setOpen((value) => !value);
        }}
      >
        <span className={styles.triggerContent}>
          <IconSlidersHorizontal size={16} />
          {label}
          <span className={styles.count}>
            {visibleCount}/{REQUEST_EVENT_COLUMNS.length}
          </span>
        </span>
      </Button>
      {open &&
        createPortal(
          <div
            id={popupId}
            ref={popupRef}
            className={styles.popup}
            style={position}
            role="dialog"
            aria-label={label}
          >
            <div className={styles.header}>
              <strong>{label}</strong>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange([])}
                disabled={!hiddenColumns.length}
              >
                {t('usage_stats.request_events_columns_all')}
              </Button>
            </div>
            <div className={styles.list}>
              {REQUEST_EVENT_COLUMNS.map((column) => {
                const checked = !hiddenColumns.includes(column.id);
                return (
                  <SelectionCheckbox
                    key={column.id}
                    className={styles.option}
                    label={t(`usage_stats.${column.label}`)}
                    checked={checked}
                    disabled={checked && visibleCount === 1}
                    onChange={(value) =>
                      onChange(
                        value
                          ? hiddenColumns.filter((id) => id !== column.id)
                          : [...hiddenColumns, column.id]
                      )
                    }
                  />
                );
              })}
            </div>
            <div className={styles.footer}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange([])}
                disabled={!hiddenColumns.length}
              >
                {t('usage_stats.request_events_columns_reset')}
              </Button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
