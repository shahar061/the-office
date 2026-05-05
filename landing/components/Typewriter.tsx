"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface TypewriterProps {
  phrases: readonly string[] | string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
}

export function Typewriter({
  phrases,
  typingSpeed = 40,
  deletingSpeed = 25,
  pauseDuration = 2000,
}: TypewriterProps) {
  const [displayText, setDisplayText] = useState("");
  const phraseIndexRef = useRef(0);
  const isDeletingRef = useRef(false);
  const textRef = useRef("");

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      const currentPhrase = phrases[phraseIndexRef.current];
      const current = textRef.current;

      if (isDeletingRef.current) {
        const next = current.slice(0, -1);
        textRef.current = next;
        setDisplayText(next);

        if (next === "") {
          isDeletingRef.current = false;
          phraseIndexRef.current = (phraseIndexRef.current + 1) % phrases.length;
          timeoutId = setTimeout(tick, typingSpeed);
        } else {
          timeoutId = setTimeout(tick, deletingSpeed);
        }
      } else {
        const next = currentPhrase.slice(0, current.length + 1);
        textRef.current = next;
        setDisplayText(next);

        if (next === currentPhrase) {
          // Pause, then start deleting on next tick
          timeoutId = setTimeout(() => {
            isDeletingRef.current = true;
            timeoutId = setTimeout(tick, deletingSpeed);
          }, pauseDuration);
        } else {
          timeoutId = setTimeout(tick, typingSpeed);
        }
      }
    };

    timeoutId = setTimeout(tick, typingSpeed);

    return () => clearTimeout(timeoutId);
  }, [phrases, typingSpeed, deletingSpeed, pauseDuration]);

  return (
    <span className="inline-flex items-center">
      <span data-testid="typewriter-text">{displayText}</span>
      <motion.span
        className="inline-block w-[3px] h-[1em] bg-accent-blue ms-0.5"
        animate={{ opacity: [1, 0] }}
        transition={{
          duration: 0.8,
          repeat: Infinity,
          repeatType: "reverse",
          ease: "easeInOut",
        }}
      />
    </span>
  );
}
