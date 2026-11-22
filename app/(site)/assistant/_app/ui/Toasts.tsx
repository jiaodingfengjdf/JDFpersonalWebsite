import { dismissToast, useApp } from '../state/store';
import { XIcon } from './Icons';

export default function Toasts() {
  const { toasts } = useApp();
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span>{t.text}</span>
          <button type="button" className="toast-close" onClick={() => dismissToast(t.id)} aria-label="关闭">
            <XIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
