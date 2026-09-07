/**
 * 全局滚动条智能显隐控制器
 * 
 * 解决 macOS WKWebView 下无法通过父级 :hover 伪类渲染 ::-webkit-scrollbar-thumb 的系统特性限制：
 * 1. 鼠标悬停在任何可滚动容器（或带有 hover-scrollbar / hover-scroll 等类的容器）时，滚动条平滑显现；
 * 2. 鼠标移出容器后，滚动条平滑隐藏为透明；
 * 3. 当用户通过触控板或滚轮滚动页面时，滚动条立即浮现（Overlay 感知），停止滚动 800ms 且鼠标未在容器内时自动淡出隐藏。
 */

export function initGlobalScrollbarBehavior(): () => void {
  if (typeof window === 'undefined') return () => {};

  let activeHoverEl: HTMLElement | null = null;
  const scrollTimers = new WeakMap<HTMLElement, ReturnJSScrollTimer>();

  type ReturnJSScrollTimer = ReturnType<typeof setTimeout>;

  function findScrollableContainer(target: HTMLElement | null): HTMLElement | null {
    let el = target;
    while (el && el !== document.body && el !== document.documentElement) {
      const cl = el.classList;
      if (
        cl.contains('hover-scrollbar') ||
        cl.contains('hover-scroll') ||
        cl.contains('custom-scrollbar') ||
        cl.contains('sidebar-scroll-area') ||
        cl.contains('inspector-scroll-area')
      ) {
        return el;
      }
      try {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) {
          return el;
        }
        const overflowX = style.overflowX;
        if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2) {
          return el;
        }
      } catch {
        // Ignore cross-origin or detached frame errors
      }
      el = el.parentElement;
    }
    return null;
  }

  // 1. 鼠标悬停监听 (pointerover / pointerout)
  const handlePointerOver = (e: PointerEvent) => {
    const container = findScrollableContainer(e.target as HTMLElement);
    if (container && container !== activeHoverEl) {
      if (activeHoverEl && !scrollTimers.has(activeHoverEl)) {
        activeHoverEl.style.setProperty('--scroll-thumb-color', 'transparent');
      }
      activeHoverEl = container;
      container.style.setProperty('--scroll-thumb-color', 'var(--scrollbar-thumb-base)');
    }
  };

  const handlePointerOut = (e: PointerEvent) => {
    if (!activeHoverEl) return;
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !activeHoverEl.contains(related)) {
      const prev = activeHoverEl;
      activeHoverEl = null;
      if (!scrollTimers.has(prev)) {
        prev.style.setProperty('--scroll-thumb-color', 'transparent');
      }
    }
  };

  // 2. 滚动手势监听 (触控板滑动 / 鼠标滚轮滚动手势)
  const handleScroll = (e: Event) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    // 显示当前正在滚动的容器滚动条
    target.style.setProperty('--scroll-thumb-color', 'var(--scrollbar-thumb-base)');

    const existingTimer = scrollTimers.get(target);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 停止滚动 800ms 后，若光标不在该容器内，则自动淡出隐藏
    const timer = setTimeout(() => {
      scrollTimers.delete(target);
      if (activeHoverEl !== target) {
        target.style.setProperty('--scroll-thumb-color', 'transparent');
      }
    }, 800);

    scrollTimers.set(target, timer);
  };

  document.addEventListener('pointerover', handlePointerOver, { capture: true, passive: true });
  document.addEventListener('pointerout', handlePointerOut, { capture: true, passive: true });
  document.addEventListener('scroll', handleScroll, { capture: true, passive: true });

  return () => {
    document.removeEventListener('pointerover', handlePointerOver, { capture: true });
    document.removeEventListener('pointerout', handlePointerOut, { capture: true });
    document.removeEventListener('scroll', handleScroll, { capture: true });
  };
}
