export function getNextElement(
  currentEl: Element,
  direction: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
  elements: Element[]
): Element | null {
  const currentRect = currentEl.getBoundingClientRect();
  const cx = currentRect.left + currentRect.width / 2;
  const cy = currentRect.top + currentRect.height / 2;

  let bestEl: Element | null = null;
  let bestDist = Infinity;

  elements.forEach((el) => {
    if (el === currentEl) return;
    const rect = el.getBoundingClientRect();
    const ex = rect.left + rect.width / 2;
    const ey = rect.top + rect.height / 2;

    const dx = ex - cx;
    const dy = ey - cy;

    let isValid = false;
    let primaryDist = 0;
    let secondaryDist = 0;
    
    if (direction === "ArrowUp" && dy < -5) {
      isValid = true;
      primaryDist = -dy;
      secondaryDist = Math.abs(dx);
    } else if (direction === "ArrowDown" && dy > 5) {
      isValid = true;
      primaryDist = dy;
      secondaryDist = Math.abs(dx);
    } else if (direction === "ArrowLeft" && dx < -5) {
      isValid = true;
      primaryDist = -dx;
      secondaryDist = Math.abs(dy);
    } else if (direction === "ArrowRight" && dx > 5) {
      isValid = true;
      primaryDist = dx;
      secondaryDist = Math.abs(dy);
    }

    if (isValid) {
      // Heavily penalize the secondary distance so that it prefers elements 
      // directly in the straight path over elements that are closer overall but diagonal.
      const score = primaryDist + secondaryDist * 5;
      if (score > 0 && score < bestDist) {
        bestDist = score;
        bestEl = el;
      }
    }
  });

  return bestEl;
}
