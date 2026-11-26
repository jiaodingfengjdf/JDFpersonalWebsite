import { dismissToast, useApp } from '../state/store';
import { AlertCircleIcon, CheckIcon, InfoIcon, XIcon } from './Icons';

export default function Toasts() {
  const { toasts } = useApp();
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon =
          t.kind === 'success' ? CheckIcon : t.kind === 'error' ? AlertCircleIcon : InfoIcon;
        return (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span className="toast-ico" aria-hidden="true">
              <Icon size={15} />
            </span>
            <span className="toast-text">{t.text}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismissToast(t.id)}
              aria-label="关闭提示"
            >
              <XIcon size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
