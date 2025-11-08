"use client";
import { motion } from "framer-motion";

export default function Loader({ text = "Loading...", visible = true }) {
  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm"
    >
      <motion.div
        className="w-12 h-12 border-4 border-t-[#4ADE80] border-gray-300 rounded-full animate-spin mb-4"
        transition={{ repeat: Infinity }}
      ></motion.div>
      <p className="text-gray-600 font-medium text-sm">{text}</p>
    </motion.div>
  );
}
