"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

type LogoCycleProps = {
  intervalMs?: number;
  className?: string;
  aspectClass?: string;
  sizes?: string;
};

const centerLogos = [
  "/brand/centro-re7-logo.png",
  "/brand/centro-re7-logo3.png",
];
const baseLogo = "/brand/re7-logo.png";

export default function LogoCycle({
  intervalMs = 3600,
  className,
  aspectClass = "aspect-[520/160]",
  sizes = "(max-width: 640px) 92vw, 560px",
}: LogoCycleProps) {
  const [index, setIndex] = useState(0);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % centerLogos.length);
      setRotation((prev) => prev + 180);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  const current = useMemo(() => centerLogos[index], [index]);

  return (
    <div className={className}>
      <div className={`relative w-full ${aspectClass}`}>
        <Image
          src={baseLogo}
          alt="Re7Online"
          fill
          className="object-contain"
          sizes={sizes}
          priority
        />
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            className="absolute left-[31%] top-[30%] h-[40%] w-[40%] -translate-x-1/2 -translate-y-1/2"
            initial={{ opacity: 0, filter: "blur(4px)", scale: 0.985, rotate: rotation - 180 }}
            animate={{ opacity: 1, filter: "blur(0px)", scale: 1, rotate: rotation }}
            exit={{ opacity: 0, filter: "blur(4px)", scale: 1.01 }}
            transition={{ duration: 0.75, ease: "easeInOut" }}
          >
            <Image
              src={current}
              alt=""
              fill
              className="object-contain"
              sizes={sizes}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
