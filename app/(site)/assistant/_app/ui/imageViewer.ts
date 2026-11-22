/**
 * 应用内全屏看图：双指缩放、放大后拖动、双击 2x / 还原、滚轮缩放。
 * 纯 DOM 实现，挂在 document.body 上，和 React 渲染互不干扰。
 */

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2;

export function openImageViewer(src: string): void {
  document.querySelector('.md-viewer')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'md-viewer';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', '查看大图');

  const stage = document.createElement('div');
  stage.className = 'md-viewer-stage';

  const picture = document.createElement('img');
  picture.src = src;
  picture.alt = '';
  picture.className = 'md-viewer-img';
  picture.draggable = false;

  const hint = document.createElement('span');
  hint.className = 'md-viewer-hint';
  hint.textContent = '双指缩放 · 双击放大 · 拖动查看';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'md-viewer-close';
  close.textContent = '关闭';

  stage.appendChild(picture);
  overlay.append(stage, hint, close);
  document.body.appendChild(overlay);

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let animate = false;

  const render = (): void => {
    picture.style.transition = animate ? 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
    picture.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    overlay.classList.toggle('is-zoomed', scale > 1.01);
  };

  const clampPan = (): void => {
    if (scale <= 1.01) {
      tx = 0;
      ty = 0;
      return;
    }
    const rect = stage.getBoundingClientRect();
    const maxX = (rect.width * (scale - 1)) / 2;
    const maxY = (rect.height * (scale - 1)) / 2;
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  };

  const reset = (): void => {
    animate = true;
    scale = 1;
    tx = 0;
    ty = 0;
    render();
    window.setTimeout(() => {
      animate = false;
    }, 240);
  };

  const zoomTo = (next: number): void => {
    animate = true;
    scale = Math.max(1, Math.min(MAX_SCALE, next));
    clampPan();
    render();
    window.setTimeout(() => {
      animate = false;
    }, 240);
  };

  /* ---------------- 手势 ---------------- */

  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStartDistance = 0;
  let pinchStartScale = 1;
  let panStartX = 0;
  let panStartY = 0;
  let moved = false;

  const distance = (): number => {
    const list = [...pointers.values()];
    if (list.length < 2) return 0;
    const [a, b] = list;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  picture.addEventListener('pointerdown', (event) => {
    picture.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved = false;
    animate = false;
    if (pointers.size === 1) {
      panStartX = event.clientX - tx;
      panStartY = event.clientY - ty;
    } else if (pointers.size === 2) {
      pinchStartDistance = distance();
      pinchStartScale = scale;
    }
  });

  picture.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2 && pinchStartDistance > 0) {
      moved = true;
      scale = Math.max(1, Math.min(MAX_SCALE, (pinchStartScale * distance()) / pinchStartDistance));
      if (scale <= 1.01) {
        tx = 0;
        ty = 0;
      }
      clampPan();
      render();
      return;
    }

    if (scale > 1.01) {
      const nextX = event.clientX - panStartX;
      const nextY = event.clientY - panStartY;
      if (Math.abs(nextX - tx) + Math.abs(nextY - ty) > 2) moved = true;
      tx = nextX;
      ty = nextY;
      clampPan();
      render();
    }
  });

  const release = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchStartDistance = 0;
    if (pointers.size === 1) {
      const only = [...pointers.values()][0];
      panStartX = only.x - tx;
      panStartY = only.y - ty;
    }
  };
  picture.addEventListener('pointerup', release);
  picture.addEventListener('pointercancel', release);

  picture.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      zoomTo(scale - event.deltaY * 0.0025);
    },
    { passive: false },
  );

  let lastTapAt = 0;
  picture.addEventListener('click', () => {
    if (moved) {
      moved = false;
      return;
    }
    const now = Date.now();
    if (now - lastTapAt < 300) {
      lastTapAt = 0;
      if (scale > 1.05) reset();
      else zoomTo(DOUBLE_TAP_SCALE);
      return;
    }
    lastTapAt = now;
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });
  close.addEventListener('click', () => overlay.remove());

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      window.removeEventListener('keydown', onKey);
      overlay.remove();
    }
  };
  window.addEventListener('keydown', onKey);

  render();
}
