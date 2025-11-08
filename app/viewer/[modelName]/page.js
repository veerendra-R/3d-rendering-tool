"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Heart } from "lucide-react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// 🧠 Apply version-based material styles
function applyVersionChanges(scene, modelName, version) {
  if (!scene) return;

  const presets = {
    sofa: {
      "Version 1": {
        Sofa: { color: "#EAB308", metalness: 0.2, roughness: 0.8 },
        Legs: { color: "#4B5563", metalness: 0.7, roughness: 0.3 },
      },
      "Version 2": {
        Sofa: { color: "#3B82F6", metalness: 0.3, roughness: 0.5 },
        Legs: { color: "#A16207", metalness: 0.6, roughness: 0.4 },
      },
      "Version 3": {
        Sofa: { color: "#10B981", metalness: 0.2, roughness: 0.7 },
        Legs: { color: "#111827", metalness: 0.8, roughness: 0.3 },
      },
    },
    table: {
      "Version 1": {
        Object_4: { color: "#92400E", metalness: 0.3, roughness: 0.7 },
        Object_6: { color: "#D6D3D1", metalness: 0.2, roughness: 0.8 },
      },
      "Version 2": {
        Object_4: { color: "#9CA3AF", metalness: 0.5, roughness: 0.5 },
        Object_6: { color: "#FBBF24", metalness: 0.3, roughness: 0.6 },
      },
    },
    chair: {
      "Version 1": {
        Cube_0: { color: "#F59E0B", metalness: 0.2, roughness: 0.7 },
        Cube_1: { color: "#4B5563", metalness: 0.6, roughness: 0.4 },
        Cube_2: { color: "#D1D5DB", metalness: 0.3, roughness: 0.6 },
      },
      "Version 2": {
        Cube_0: { color: "#60A5FA", metalness: 0.3, roughness: 0.5 },
        Cube_1: { color: "#6B7280", metalness: 0.5, roughness: 0.4 },
        Cube_2: { color: "#9CA3AF", metalness: 0.4, roughness: 0.5 },
      },
      "Version 3": {
        Cube_0: { color: "#A78BFA", metalness: 0.5, roughness: 0.4 },
        Cube_1: { color: "#FDE68A", metalness: 0.3, roughness: 0.6 },
        Cube_2: { color: "#4B5563", metalness: 0.6, roughness: 0.4 },
      },
      "Version 4": {
        Cube_0: { color: "#F87171", metalness: 0.4, roughness: 0.5 },
        Cube_1: { color: "#9CA3AF", metalness: 0.5, roughness: 0.4 },
        Cube_2: { color: "#E5E7EB", metalness: 0.3, roughness: 0.7 },
      },
    },
  };

  const config = presets[modelName]?.[version];
  if (!config) return;

  scene.traverse((child) => {
    if (child.isMesh) {
      const mat = config[child.name];
      if (mat) {
        child.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(mat.color),
          metalness: mat.metalness,
          roughness: mat.roughness,
        });
      }
    }
  });
}

// 🎨 Model Loader Component
function ModelViewer({ modelUrl, modelName, version }) {
  const [scene, setScene] = useState(null);

  useEffect(() => {
    if (!modelUrl) return;
    const loader = new GLTFLoader();

    loader.load(
      modelUrl,
      (gltf) => {
        const clone = gltf.scene.clone(true);
        applyVersionChanges(clone, modelName, version);
        setScene(clone);
      },
      undefined,
      (err) => console.error("GLTF load error:", err)
    );

    return () => setScene(null);
  }, [modelUrl, modelName, version]);

  if (!scene) return null;
  return <primitive object={scene} dispose={null} />;
}

// 🧩 Main Product Viewer
export default function ProductViewer() {
  const { modelName } = useParams();
  const router = useRouter();
  const [modelUrl, setModelUrl] = useState(null);
  const [activeVersion, setActiveVersion] = useState("Version 1");
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isInCart, setIsInCart] = useState(false);

  const products = {
    sofa: {
      name: "Sofa Model A",
      file: "/models/sofa.glb",
      description: "A premium L-shaped sofa with customizable fabric and leg finishes.",
      versions: {
        "Version 1": { label: "Warm Mustard Fabric + Metal Legs", colorScheme: ["#EAB308", "#4B5563"], materialStyle: "Matte Fabric & Brushed Metal", textureType: "Soft" },
        "Version 2": { label: "Royal Blue with Bronze Legs", colorScheme: ["#3B82F6", "#A16207"], materialStyle: "Velvet Touch with Metallic Accents", textureType: "Smooth" },
        "Version 3": { label: "Mint Green with Black Legs", colorScheme: ["#10B981", "#111827"], materialStyle: "Cotton Blend + Matte Finish", textureType: "Rough" },
      },
      price: "₹24,999",
      thumbnail: "/thumbnails/sofa-thumb.png",
    },
    table: {
      name: "Dining Table Set",
      file: "/models/table.glb",
      description: "Elegant six-seater dining set with multiple tabletop and chair color options.",
      versions: {
        "Version 1": { label: "Rustic Wood Finish", colorScheme: ["#92400E", "#D6D3D1"], materialStyle: "Polished Wood + Neutral Fabric", textureType: "Grainy" },
        "Version 2": { label: "Modern Gray & Gold", colorScheme: ["#9CA3AF", "#FBBF24"], materialStyle: "Satin Metal + Glossy Accents", textureType: "Glossy" },
      },
      price: "₹35,499",
      thumbnail: "/thumbnails/table-thumb.png",
    },
    chair: {
      name: "Office Chair Pro",
      file: "/models/chair.glb",
      description: "Ergonomic office chair designed for all-day comfort with multiple finishes.",
      versions: {
        "Version 1": { label: "Amber Seat with Dark Frame", colorScheme: ["#F59E0B", "#4B5563", "#D1D5DB"], materialStyle: "Matte Plastic + Metal Legs", textureType: "Smooth" },
        "Version 2": { label: "Blue Seat with Gray Base", colorScheme: ["#60A5FA", "#9CA3AF"], materialStyle: "Soft Touch Plastic", textureType: "Matte" },
        "Version 3": { label: "Purple and Yellow Contrast", colorScheme: ["#A78BFA", "#FDE68A", "#4B5563"], materialStyle: "Dual Tone Matte Finish", textureType: "Satin" },
        "Version 4": { label: "Red Seat with Metallic Frame", colorScheme: ["#F87171", "#9CA3AF", "#E5E7EB"], materialStyle: "Semi Gloss + Metal", textureType: "Glossy" },
      },
      price: "₹14,999",
      thumbnail: "/thumbnails/chair-thumb.png",
    },
  };

  const product = products[modelName] || products.sofa;
  const activeDetails = product.versions[activeVersion];

  useEffect(() => {
    if (product?.file) setModelUrl(product.file);
  }, [product]);

  return (
    <main className="min-h-screen bg-[#FAF4ED] text-gray-800 flex flex-col">
      <header className="flex justify-between items-center px-8 py-4 bg-white shadow-sm border-b border-gray-200">
        <button
          onClick={() => router.push("/marketplace")}
          className="flex items-center gap-1 text-[#4ADE80] hover:text-[#3fd270] transition"
        >
          <ArrowLeft size={18} />
          <span className="font-medium">Back to Marketplace</span>
        </button>
        <h1 className="text-xl font-semibold capitalize">{product.name}</h1>
        <div className="w-28" />
      </header>

      <div className="flex flex-col lg:flex-row flex-1 p-6 gap-6">
        {/* Canvas Section */}
        <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-200 rounded-2xl shadow-md relative">
          <div className="relative bg-white shadow-lg rounded-lg overflow-hidden w-full h-[70vh] max-w-[900px]">
            {modelUrl && (
              <Canvas
                style={{ width: "100%", height: "100%" }}
                gl={{
                  physicallyCorrectLights: true,
                  outputEncoding: THREE.sRGBEncoding,
                  toneMapping: THREE.ACESFilmicToneMapping,
                }}
                camera={{ position: [0, 1.5, 4], fov: 45 }}
              >
                <color attach="background" args={["#f3f4f6"]} />
                <ambientLight intensity={0.6} />
                <directionalLight position={[2, 2, 2]} intensity={1.2} />
                <hemisphereLight skyColor="#ffffff" groundColor="#b9b9b9" intensity={0.6} />
                <ModelViewer modelUrl={modelUrl} modelName={modelName} version={activeVersion} />
                <OrbitControls enableZoom enablePan />
              </Canvas>
            )}
          </div>

          {/* Version Buttons */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-2xl shadow-lg flex gap-2 border border-gray-200">
            {Object.keys(product.versions).map((v) => (
              <button
                key={v}
                onClick={() => setActiveVersion(v)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition ${
                  v === activeVersion
                    ? "bg-blue-500 text-white shadow"
                    : "bg-white text-gray-700 hover:bg-blue-100"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-[350px] bg-white rounded-2xl shadow-md p-6 flex flex-col overflow-hidden">
          <img src={product.thumbnail} alt={product.name} className="rounded-lg mb-4 shadow-sm" />
          <h2 className="text-xl font-semibold mb-2">{product.name}</h2>
          <p className="text-gray-600 mb-4 text-sm leading-relaxed">{product.description}</p>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeVersion}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="mb-5"
            >
              <h3 className="text-md font-semibold mb-2 text-gray-800">{activeVersion} Details</h3>
              <p className="text-sm text-gray-600 mb-2 italic">{activeDetails.label}</p>
              <div className="flex items-center gap-2 mb-2">
                {activeDetails.colorScheme.map((c, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-6 h-6 rounded-full border border-gray-300 shadow-sm"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <p className="text-sm text-gray-700">
                <span className="font-medium">Material:</span> {activeDetails.materialStyle}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-medium">Texture:</span> {activeDetails.textureType}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-auto space-y-3">
            <p className="text-lg font-semibold text-gray-800">{product.price}</p>

            {/* Wishlist + Add to Cart Buttons */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setIsWishlisted(!isWishlisted)}
                className="flex items-center gap-2 text-gray-600 hover:text-[#4ADE80] transition font-medium"
              >
                <Heart
                  size={20}
                  className={`transition ${
                    isWishlisted ? "fill-[#4ADE80] text-[#4ADE80]" : "text-gray-400"
                  }`}
                />
                {isWishlisted ? "Wishlisted" : "Add to Wishlist"}
              </button>

              <button
                onClick={() => setIsInCart(true)}
                disabled={isInCart}
                className={`px-4 py-2 rounded-lg text-white font-semibold transition ${
                  isInCart
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#4ADE80] hover:bg-[#3fd270]"
                }`}
              >
                {isInCart ? "Added" : "Add to Cart"}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
