import { useEffect, useState } from 'react';

interface RailItem {
  id: string;
  label: string;
  el: HTMLElement;
}

/**
 * 设置页左侧竖向菜单：扫描 .set-sec 区块标题生成条目，
 * 点击滚动到对应区块；滚动时高亮当前区块。
 */
export default function SettingsRail(): React.ReactElement | null {
  const [items, setItems] = useState<RailItem[]>([]);
  const [active, setActive] = useState('');

  useEffect(() => {
    const host = document.querySelector<HTMLElement>('[data-settings-root]');
    if (!host) return;
    const pane = host.closest<HTMLElement>('.settings-pane') ?? host;

    let found: RailItem[] = [];

    const build = () => {
      const nodes = Array.from(host.querySelectorAll<HTMLElement>('.set-sec'));
      const next: RailItem[] = [];
      nodes.forEach((node, index) => {
        const label = (node.querySelector('.set-sec-title')?.textContent ?? '').trim();
        if (!label) return;
        if (!node.id) node.id = `set-sec-${index}`;
        next.push({ id: node.id, label, el: node });
      });
      found = next;
      setItems(next);
    };

    build();

    const onScroll = () => {
      const top = pane.getBoundingClientRect().top;
      let current = '';
      for (const item of found) {
        const rect = item.el.getBoundingClientRect();
        if (rect.top - top <= 24) current = item.id;
      }
      setActive(current || found[0]?.id || '');
    };

    pane.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => pane.removeEventListener('scroll', onScroll);
  }, []);

  if (items.length === 0) return null;

  return (
    <nav className="settings-rail" aria-label="设置分类">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`rail-item${active === item.id ? ' is-on' : ''}`}
          onClick={() => {
            setActive(item.id);
            item.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          <span className="rail-text">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
