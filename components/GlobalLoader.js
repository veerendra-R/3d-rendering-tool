"use client";
import { motion, AnimatePresence } from "framer-motion";

export default function GlobalLoader({ isLoading, message = "Loading..." }) {
  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          key="loader"
          className="fixed inset-0 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm z-[9999]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="w-12 h-12 border-4 border-t-[#4ADE80] border-gray-300 rounded-full animate-spin" />
          <p className="mt-4 text-gray-700 font-medium text-sm">{message}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
