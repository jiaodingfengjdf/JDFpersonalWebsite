import { useEffect, useMemo, useRef, useState } from 'react';

interface NavItem {
  id: string;
  label: string;
  el: HTMLElement;
}

/**
 * 设置页分类导航（移动端 / 窄屏吸顶快捷芯片条）：
 * 扫描页面区块标题，点击平滑滚动到对应分组，并跟随滚动高亮。
 */
export default function SettingsNav(): React.ReactElement | null {
  const [items, setItems] = useState<NavItem[]>([]);
  const [active, setActive] = useState('');
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = document.querySelector<HTMLElement>('[data-settings-root]');
    if (!host) return;
    const pane = host.closest<HTMLElement>('.settings-pane') ?? host;

    let found: NavItem[] = [];
    const build = () => {
      const nodes = Array.from(host.querySelectorAll<HTMLElement>('.set-sec'));
      const next: NavItem[] = [];
      nodes.forEach((node, index) => {
        const titleEl = node.querySelector<HTMLElement>('.set-sec-title, h2, h3');
        const label = (titleEl?.textContent ?? '').trim();
        if (!label) return;
        if (!node.id) node.id = `settings-sec-${index}`;
        next.push({ id: node.id, label, el: node });
      });
      found = next;
      setItems(next);
    };

    const onScroll = () => {
      const top = pane.getBoundingClientRect().top;
      let current = '';
      for (const item of found) {
        const rect = item.el.getBoundingClientRect();
        if (rect.top - top <= 80) current = item.id;
      }
      setActive(current || found[0]?.id || '');
    };

    const timer = window.setTimeout(() => {
      build();
      onScroll();
    }, 40);

    pane.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      pane.removeEventListener('scroll', onScroll);
    };
  }, []);

  const jump = (item: NavItem): void => {
    setActive(item.id);
    item.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const chips = useMemo(() => items.filter((item) => item.label.length <= 14), [items]);
  if (chips.length < 2) return null;

  return (
    <div className="settings-nav" ref={barRef} role="navigation" aria-label="设置快捷分组">
      <div className="settings-nav-scroll">
        {chips.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`settings-nav-chip${active === item.id ? ' is-on' : ''}`}
            onClick={() => jump(item)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
