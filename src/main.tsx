import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { AppleStyleDock } from '@/components/ui/demo';

import '@fontsource-variable/inter';
import './styles/globals.css';

const root = document.getElementById('dock-root');
if (!root) throw new Error('Zeramaill dock mount is missing');

createRoot(root).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <AppleStyleDock />
    </MotionConfig>
  </StrictMode>,
);
