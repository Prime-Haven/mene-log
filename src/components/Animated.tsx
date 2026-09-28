import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";

export function PageTransition(props: HTMLMotionProps<"div">) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : "hidden"}
      animate="visible"
      variants={fadeUp}
      {...props}
    />
  );
}

export function StaggerList(props: HTMLMotionProps<"div">) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : "hidden"}
      animate="visible"
      variants={staggerContainer}
      {...props}
    />
  );
}

export function StaggerItem(props: HTMLMotionProps<"div">) {
  return <motion.div variants={fadeUp} {...props} />;
}
