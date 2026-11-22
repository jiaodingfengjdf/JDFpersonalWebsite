import { useEffect, useMemo, useRef, useState } from 'react';

interface NavItem {
  id: string;
  label: string;
  el: HTMLElement;
}

/**
 * 设置页分类导航：运行时扫描页面里的区块标题，生成吸顶分类条。
 * 不改动任何 Section 组件，点一下平滑滚到对应区块。
 */
export default function SettingsNav(): React.ReactElement | null {
  const [items, setItems] = useState<NavItem[]>([]);
  const [active, setActive] = useState('');
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const host = document.querySelector('[data-settings-root]');
      if (!host) return;
      const nodes = Array.from(host.querySelectorAll<HTMLElement>('section, .settings-section'));
      const found: NavItem[] = [];
      nodes.forEach((node, index) => {
        const titleEl = node.querySelector<HTMLElement>('h2, h3, .section-title, .settings-title');
        const label = (titleEl?.textContent ?? '').trim();
        if (!label) return;
        if (!node.id) node.id = `settings-sec-${index}`;
        found.push({ id: node.id, label, el: node });
      });
      setItems(found);
    }, 60);
    return () => window.clearTimeout(timer);
  }, []);

  const jump = (item: NavItem): void => {
    setActive(item.id);
    item.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // 滚完把高亮交回滚动监听
    window.setTimeout(() => setActive(''), 1200);
  };

  const chips = useMemo(() => items.filter((item) => item.label.length <= 12), [items]);
  if (chips.length < 3) return null;

  return (
    <div className="settings-nav" ref={barRef}>
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
