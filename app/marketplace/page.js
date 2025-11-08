"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import GlobalLoader from "../../components/GlobalLoader";

export default function Marketplace() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const products = [
    {
      id: 1,
      name: "Sofa Model A",
      file: "/models/sofa.glb",
      image: "/thumbnails/sofa-thumb.png",
      description:
        "A modern L-shaped sofa with customizable fabric and color options.",
      versions: ["Version 1", "Version 2", "Version 3"],
      colors: ["#4ADE80", "#f59e0b", "#3b82f6"],
      materials: ["Fabric", "Wood", "Metal"],
      price: "₹24,999",
    },
    {
      id: 2,
      name: "Dining Table Set",
      file: "/models/table.glb",
      image: "/thumbnails/table-thumb.png",
      description:
        "Elegant six-seater wooden dining table with material customization.",
      versions: ["Version 1", "Version 2"],
      colors: ["#b45309", "#a8a29e", "#facc15"],
      materials: ["Wood", "Glass", "Steel"],
      price: "₹35,499",
    },
    {
      id: 3,
      name: "Office Chair Pro",
      file: "/models/chair.glb",
      image: "/thumbnails/chair-thumb.png",
      description:
        "Ergonomic office chair with multiple texture and color variants.",
      versions: ["Version 1", "Version 2", "Version 3", "Version 4"],
      colors: ["#10b981", "#ef4444", "#6366f1"],
      materials: ["Plastic", "Leather", "Metal"],
      price: "₹14,999",
    },
  ];

  // ✅ Clean navigate with loader and no loops
  const handleNavigate = (path) => {
    if (isLoading) return; // prevent double click loops
    setIsLoading(true);
    setTimeout(() => router.push(path), 400);
  };

  return (
    <main className="min-h-screen bg-[#FAF4ED] text-gray-800 flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center px-8 py-4 bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
        <h1 className="text-2xl font-bold text-gray-800">Marketplace</h1>
        <button
          onClick={() => handleNavigate("/")}
          className="bg-[#4ADE80] text-white px-5 py-2 rounded-full font-medium hover:bg-[#3fd270] transition"
        >
          + Create Product
        </button>
      </header>

      {/* Product Grid */}
      <section className="p-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {products.map((product) => (
          <div
            key={product.id}
            onClick={() =>
              handleNavigate(
                `/viewer/${product.file
                  .replace("/models/", "")
                  .replace(".glb", "")}`
              )
            }
            className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-all border border-gray-100 flex flex-col overflow-hidden cursor-pointer hover:-translate-y-1"
          >
            {/* Product Image */}
            <div className="relative w-full aspect-[4/3] bg-gradient-to-b from-gray-50 to-gray-200 flex items-center justify-center overflow-hidden">
              <img
                src={product.image}
                alt={product.name}
                className="object-contain w-full h-full p-4 transition-transform duration-500 hover:scale-105"
              />
            </div>

            {/* Product Details */}
            <div className="p-5 flex-1 flex flex-col">
              <h2 className="text-lg font-semibold mb-1">{product.name}</h2>
              <p className="text-gray-600 text-sm mb-3 leading-snug">
                {product.description}
              </p>

              {/* Versions */}
              <div className="flex flex-wrap gap-2 mb-3">
                {product.versions.map((v, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 text-xs bg-green-100 text-green-600 rounded-full"
                  >
                    {v}
                  </span>
                ))}
              </div>

              {/* Colors */}
              <div className="flex gap-1.5 mb-3">
                {product.colors.map((c, i) => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-full border border-gray-300 shadow-sm"
                    style={{ backgroundColor: c }}
                  ></div>
                ))}
              </div>

              {/* Materials */}
              <div className="text-xs text-gray-500 mb-4">
                <span className="font-medium text-gray-700">Materials:</span>{" "}
                {product.materials.join(", ")}
              </div>

              {/* Price + View */}
              <div className="mt-auto flex items-center justify-between">
                <p className="text-lg font-semibold text-gray-800">
                  {product.price}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNavigate(
                      `/viewer/${product.file
                        .replace("/models/", "")
                        .replace(".glb", "")}`
                    );
                  }}
                  className="flex items-center gap-1 text-[#4ADE80] hover:text-[#3fd270] font-medium"
                >
                  <Eye size={18} /> View Model
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      <GlobalLoader isLoading={isLoading} message="Opening 3D Viewer..." />
    </main>
  );
}
