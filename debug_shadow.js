const rightEdge = window.innerWidth - 300;
const els = document.querySelectorAll('*');
const suspicious = [];
els.forEach(el => {
  const rect = el.getBoundingClientRect();
  if (rect.right >= rightEdge) {
    const style = window.getComputedStyle(el);
    if (style.boxShadow && style.boxShadow !== 'none' && !style.boxShadow.includes('inset')) {
      suspicious.push({
        tag: el.tagName,
        className: el.className,
        shadow: style.boxShadow,
        rect: rect
      });
    }
  }
});
console.log(JSON.stringify(suspicious, null, 2));
