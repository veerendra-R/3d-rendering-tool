"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Loader from "../components/Loader";

export default function ClientLayout({ children }) {
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(timeout);
  }, [pathname]);

  return (
    <>
      <Loader visible={loading} />
      {children}
    </>
  );
}
