import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

export const CursorRobot: React.FC = () => {
    const [position, setPosition] = useState({ x: 300, y: 300 });
    const [direction, setDirection] = useState<"left" | "right">("right");
    const [verticalDirection, setVerticalDirection] = useState<
        "up" | "down" | "none"
    >("none");
    const [isWalking, setIsWalking] = useState(false);

    const target = useRef({ x: 300, y: 300 });
    const animationFrame = useRef<number | null>(null);

    const WALK_SPEED = 1.2;

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            target.current = {
                x: e.clientX - 16,
                y: e.clientY - 48,
            };
        };

        window.addEventListener("mousemove", handleMouseMove);

        const animate = () => {
            setPosition((prev) => {
                const dx = target.current.x - prev.x;
                const dy = target.current.y - prev.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 1) {
                    setIsWalking(false);
                    setVerticalDirection("none");
                    return prev;
                }

                setIsWalking(true);

                if (dx > 0.5) setDirection("right");
                else if (dx < -0.5) setDirection("left");

                if (dy < -0.5) setVerticalDirection("up");
                else if (dy > 0.5) setVerticalDirection("down");
                else setVerticalDirection("none");

                const moveX = (dx / distance) * WALK_SPEED;
                const moveY = (dy / distance) * WALK_SPEED;

                return {
                    x: prev.x + moveX,
                    y: prev.y + moveY,
                };
            });

            animationFrame.current = requestAnimationFrame(animate);
        };

        animationFrame.current = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            if (animationFrame.current)
                cancelAnimationFrame(animationFrame.current);
        };
    }, []);

    const isBackView = verticalDirection === "up";

    return (
        <motion.div
            animate={{
                x: position.x,
                y: position.y,
                scaleX:
                    direction === "right"
                        ? isBackView
                            ? 0.8
                            : 1
                        : isBackView
                            ? -0.8
                            : -1,
                scaleY: isBackView ? 0.9 : 1,
            }}
            transition={{ type: "tween", ease: "linear", duration: 0.1 }}
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                zIndex: 9999,
                pointerEvents: "none",
            }}
        >
            <div className="relative w-8 h-11 flex flex-col items-center">
                {/* Shadow */}
                <motion.div
                    className="absolute bottom-0 w-5 h-1.5 bg-black/10 rounded-full blur-[2px]"
                    animate={{
                        scale: isWalking ? (isBackView ? 0.7 : 1) : 1,
                        opacity: isBackView ? 0.4 : 1,
                    }}
                    transition={{ duration: 0.3 }}
                />

                {/* Body */}
                <motion.div
                    className="w-7 h-9 bg-white border border-slate-200 rounded-xl shadow-md flex flex-col items-center pt-1 relative"
                    animate={
                        isWalking
                            ? {
                                y: [0, -2, 0],
                                rotate: isBackView
                                    ? 0
                                    : verticalDirection === "down"
                                        ? 4
                                        : [0, -2, 2, -2, 2, 0],
                            }
                            : { y: 0, rotate: 0 }
                    }
                    transition={{
                        duration: 0.5,
                        repeat: isWalking ? Infinity : 0,
                    }}
                >
                    {/* Eyes (Hidden in Back View) */}
                    {!isBackView && (
                        <div className="w-5 h-3 bg-[#1a1b2e] rounded-full flex items-center justify-center gap-1 mt-1">
                            <div className="w-1 h-1 bg-cyan-400 rounded-full" />
                            <div className="w-1 h-1 bg-cyan-400 rounded-full" />
                        </div>
                    )}

                    {/* Shine */}
                    <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/70 to-transparent opacity-40" />

                    {/* Ears */}
                    <div className="absolute -left-1 top-3 w-1.5 h-3 bg-slate-300 rounded-full" />
                    <div className="absolute -right-1 top-3 w-1.5 h-3 bg-slate-300 rounded-full" />
                </motion.div>

                {/* Legs */}
                <div className="flex gap-2 -mt-1 px-1">
                    <motion.div
                        className="w-1.5 h-3 bg-slate-800 rounded-b-full"
                        animate={
                            isWalking
                                ? { y: [0, -4, 0], rotate: [0, 15, 0] }
                                : { y: 0 }
                        }
                        transition={{
                            duration: 0.4,
                            repeat: isWalking ? Infinity : 0,
                        }}
                    />
                    <motion.div
                        className="w-1.5 h-3 bg-slate-800 rounded-b-full"
                        animate={
                            isWalking
                                ? { y: [-4, 0, -4], rotate: [0, -15, 0] }
                                : { y: 0 }
                        }
                        transition={{
                            duration: 0.4,
                            repeat: isWalking ? Infinity : 0,
                        }}
                    />
                </div>
            </div>
        </motion.div>
    );
};