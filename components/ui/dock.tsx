'use client';

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
  type SpringOptions,
} from 'framer-motion';
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

const DOCK_HEIGHT = 128;
const DEFAULT_MAGNIFICATION = 80;
const DEFAULT_DISTANCE = 150;
const DEFAULT_PANEL_HEIGHT = 64;
const DEFAULT_SPRING: SpringOptions = { mass: 0.1, stiffness: 150, damping: 12 };

type DockProps = {
  children: ReactNode;
  className?: string;
  distance?: number;
  panelHeight?: number;
  magnification?: number;
  spring?: SpringOptions;
  baseItemSize?: number;
  ariaLabel?: string;
};

type DockItemProps = {
  className?: string;
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  label?: string;
  active?: boolean;
};

// Internal motion props injected into the supplied DockIcon / DockLabel API.
// Keeping these explicit also makes cloneElement safe with React 19's types.
type DockChildMotionProps = {
  width?: MotionValue<number>;
  isHovered?: MotionValue<number>;
};

type DockLabelProps = DockChildMotionProps & {
  className?: string;
  children: ReactNode;
};
type DockIconProps = DockChildMotionProps & {
  className?: string;
  children: ReactNode;
};

type DockContextType = {
  mouseX: MotionValue<number>;
  spring: SpringOptions;
  magnification: number;
  distance: number;
  baseItemSize: number;
};

const DockContext = createContext<DockContextType | undefined>(undefined);

function useDock() {
  const context = useContext(DockContext);
  if (!context) throw new Error('useDock must be used within a Dock');
  return context;
}

function Dock({
  children,
  className,
  spring = DEFAULT_SPRING,
  magnification = DEFAULT_MAGNIFICATION,
  distance = DEFAULT_DISTANCE,
  panelHeight = DEFAULT_PANEL_HEIGHT,
  baseItemSize = 40,
  ariaLabel = 'Application dock',
}: DockProps) {
  const mouseX = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const maxHeight = Math.max(DOCK_HEIGHT, magnification * 1.5 + 4);
  const heightRow = useTransform(isHovered, [0, 1], [panelHeight, maxHeight]);
  const height = useSpring(heightRow, spring);
  const context = useMemo(
    () => ({ mouseX, spring, distance, magnification, baseItemSize }),
    [mouseX, spring, distance, magnification, baseItemSize],
  );

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-dock-item]')];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus({ preventScroll: true });
    items[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  return (
    <motion.div
      style={{ height: reduceMotion ? maxHeight : height, scrollbarWidth: 'none' }}
      className="dock-scroll mx-2 flex max-w-full items-end overflow-x-auto"
    >
      <motion.div
        onMouseMove={({ clientX }) => {
          isHovered.set(1);
          // clientX and getBoundingClientRect use the same viewport coordinates.
          mouseX.set(clientX);
        }}
        onMouseLeave={(event) => {
          if (!event.currentTarget.contains(document.activeElement)) {
            isHovered.set(0);
            mouseX.set(Infinity);
          }
        }}
        onFocusCapture={() => isHovered.set(1)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            isHovered.set(0);
            mouseX.set(Infinity);
          }
        }}
        onKeyDown={handleKeys}
        className={cn('mx-auto flex w-fit shrink-0 gap-4 rounded-2xl bg-gray-50 px-4 dark:bg-neutral-900', className)}
        style={{ height: panelHeight }}
        role="toolbar"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
      >
        <DockContext.Provider value={context}>{children}</DockContext.Provider>
      </motion.div>
    </motion.div>
  );
}

function DockItem({ children, className, href, onClick, label, active }: DockItemProps) {
  const ref = useRef<HTMLElement | null>(null);
  const pointerInside = useRef(false);
  const { distance, magnification, mouseX, spring, baseItemSize } = useDock();
  const reduceMotion = useReducedMotion();
  const isHovered = useMotionValue(0);
  const mouseDistance = useTransform(mouseX, value => {
    const rect = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return value - rect.x - rect.width / 2;
  });
  const widthTransform = useTransform(mouseDistance, [-distance, 0, distance], [baseItemSize, magnification, baseItemSize]);
  const width = useSpring(widthTransform, spring);
  const labelChild = Children.toArray(children).find(child => isValidElement<DockLabelProps>(child) && child.type === DockLabel);
  const accessibleLabel = label ?? (isValidElement<DockLabelProps>(labelChild) && typeof labelChild.props.children === 'string' ? labelChild.props.children : undefined);

  const content = Children.map(children, child => {
    if (!isValidElement<DockChildMotionProps>(child) || (child.type !== DockIcon && child.type !== DockLabel)) return child;
    return cloneElement(child, { width, isHovered });
  });

  const interaction = {
    ref: (element: HTMLElement | null) => { ref.current = element; },
    style: { width: reduceMotion ? baseItemSize : width },
    onHoverStart: () => { pointerInside.current = true; isHovered.set(1); },
    onHoverEnd: () => {
      pointerInside.current = false;
      if (ref.current !== document.activeElement) isHovered.set(0);
    },
    onFocus: () => {
      isHovered.set(1);
      const rect = ref.current?.getBoundingClientRect();
      if (rect) mouseX.set(rect.x + rect.width / 2);
    },
    onBlur: () => { if (!pointerInside.current) isHovered.set(0); },
    onClick,
    className: cn('relative inline-flex shrink-0 items-center justify-center', className),
    'data-dock-item': '',
    'data-active': active || undefined,
    'aria-label': accessibleLabel,
  };

  // Native links and buttons provide keyboard activation and real navigation.
  // There is no aria-haspopup because these actions do not open popup menus.
  if (href) return <motion.a {...interaction} href={href} aria-current={active ? 'page' : undefined}>{content}</motion.a>;
  return <motion.button {...interaction} type="button">{content}</motion.button>;
}

function DockLabel({ children, className, isHovered }: DockLabelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (!isHovered) return;
    const unsubscribe = isHovered.on('change', latest => setIsVisible(latest === 1));
    return unsubscribe;
  }, [isHovered]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.span
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: reduceMotion ? 0 : -10 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
          className={cn('dock-tooltip absolute -top-6 left-1/2 w-fit whitespace-pre rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs text-neutral-700 dark:border-neutral-900 dark:bg-neutral-800 dark:text-white', className)}
          role="tooltip"
          aria-hidden="true"
          style={{ x: '-50%' }}
        >{children}</motion.span>
      )}
    </AnimatePresence>
  );
}

function DockIcon({ children, className, width }: DockIconProps) {
  const { baseItemSize } = useDock();
  const fallbackWidth = useMotionValue(baseItemSize);
  const reduceMotion = useReducedMotion();
  const widthTransform = useTransform(width ?? fallbackWidth, value => value / 2);
  return (
    <motion.span style={{ width: reduceMotion ? baseItemSize / 2 : widthTransform }} className={cn('flex items-center justify-center', className)} aria-hidden="true">{children}</motion.span>
  );
}

export { Dock, DockIcon, DockItem, DockLabel };
export type { DockProps, DockItemProps, DockIconProps, DockLabelProps };
