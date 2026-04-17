'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}

export function Reveal({ children, delay = 0, y = 20, className }: RevealProps) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -80px 0px' }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.7, 0.2, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
