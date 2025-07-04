'use client';

import { useRef, useState, useCallback, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { FaSave, FaUndoAlt, FaRedoAlt, FaTrash, FaUpload, FaImage, FaEye } from 'react-icons/fa';
import { saveModelBlob, getModelBlob, saveModelState, getModelState } from '../app/utils/idb';
import {
  Undo2,
  Redo2,
  Trash2,
  Save,
  Upload,
  Image as LucideImage,
  Eye,
  Square,
} from 'lucide-react';


const MAX_HISTORY = 20;
const HISTORY_KEY = 'historyState';
const CAMERA_VIEWS = {
  perspective: { position: [0, 0, 5], lookAt: [0, 0, 0] },
  front:      { position: [0, 0, 5], lookAt: [0, 0, 0] },
  top:        { position: [0, 5, 0], lookAt: [0, 0, 0] },
  left:       { position: [-5, 0, 0], lookAt: [0, 0, 0] },
  right:      { position: [5, 0, 0], lookAt: [0, 0, 0] }
};

export default function CanvasViewer() {
  const [selectedMesh, setSelectedMesh] = useState(null);
  const [scene, setScene] = useState(null);
  const [selectedName, setSelectedName] = useState(null);
  const [modelUrl, setModelUrl] = useState(null);
  const [undoHistory, setUndoHistory] = useState([]);
  const [redoHistory, setRedoHistory] = useState([]);
  const [textureList, setTextureList] = useState([]);
  const [meshParts, setMeshParts] = useState([]);
  const [mode, setMode] = useState('view'); // or 'select'

  // Camera controls
  const cameraRef = useRef();
  const controlsRef = useRef();
  const [cameraView, setCameraView] = useState('perspective');
  
  const cameraViews = {
    perspective: { position: [0, 0, 5], lookAt: [0, 0, 0] },
    front:      { position: [0, 0, 5], lookAt: [0, 0, 0] },
    top:        { position: [0, 5, 0], lookAt: [0, 0, 0] },
    left:       { position: [-5, 0, 0], lookAt: [0, 0, 0] },
    right:      { position: [5, 0, 0], lookAt: [0, 0, 0] }
  };

  // Only initialize from IndexedDB, not localStorage
  useEffect(() => {
    setModelUrl(localStorage.getItem('modelUrl') || null);
    setTextureList(JSON.parse(localStorage.getItem('textureList') || '[]'));
    (async () => {
      const saved = await getModelState(HISTORY_KEY);
      if (saved) {
        setUndoHistory(saved.undoHistory || []);
        setRedoHistory(saved.redoHistory || []);
      }
    })();
  }, []);

  // Persist undo/redo to IndexedDB
  useEffect(() => {
    (async () => {
      await saveModelState(HISTORY_KEY, { undoHistory, redoHistory });
    })();
  }, [undoHistory, redoHistory]);

  useEffect(() => {
    if (!scene || !modelUrl) return;
    const restore = async () => {
      const saved = await getModelState('modelState');
      if (!saved) return;
      saved.materials.forEach(({ name, color, textureDataURL }) => {
        const mesh = scene.getObjectByName(name);
        if (!mesh) return;
        mesh.material.color = new THREE.Color(color);
        if (textureDataURL) {
          mesh.material.map = new THREE.TextureLoader().load(textureDataURL);
        }
        mesh.material.needsUpdate = true;
      });
    };
    restore();
  }, [scene, modelUrl]);

  // -----------------
  // Utility functions
  // -----------------

  const serializeMaterial = (mesh, type = 'custom', textureDataURL = null) => ({
    name: mesh.name,
    uuid: mesh.uuid,
    color: mesh.material.color.getHex(),
    preset: type,
    textureDataURL,
    roughness: mesh.material.roughness || 0.5,
    metalness: mesh.material.metalness || 0.5,
  });

  const deserializeMaterial = (scene, saved) => {
    // Try to find by UUID first, then by name as fallback
    let mesh = scene.getObjectByProperty('uuid', saved.uuid);
    if (!mesh && saved.name) {
      mesh = scene.getObjectByName(saved.name);
    }
    if (!mesh) {
      console.warn('Could not find mesh for undo/redo:', saved.name || saved.uuid);
      return;
    }

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(saved.color),
      roughness: saved.roughness || 0.5,
      metalness: saved.metalness || 0.5,
    });

    if (saved.textureDataURL) {
      const texture = new THREE.TextureLoader().load(saved.textureDataURL);
      material.map = texture;
    }

    mesh.material = material;
    mesh.material.needsUpdate = true;
  };

  const getTextureDataUrl = (texture) => {
    return new Promise((resolve) => {
      const image = texture.image;
      if (!image) return resolve(null);
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      resolve(canvas.toDataURL());
    });
  };

  // -----------------
  // Undo/Redo system
  // -----------------

  // 1. Always push the previous state, with mesh name, into undoHistory
  const pushUndo = async (mesh, preset = 'custom') => {
    if (!mesh || !mesh.material) return;
    let currentTextureDataURL = null;
    if (mesh.material.map && mesh.material.map.image) {
      currentTextureDataURL = await getTextureDataUrl(mesh.material.map);
    }
    const currentState = serializeMaterial(mesh, preset, currentTextureDataURL);
    setUndoHistory((prev) => {
      const updated = [...prev, { meshName: mesh.name, material: currentState }];
      if (updated.length > MAX_HISTORY) updated.shift();
      return updated;
    });
    setRedoHistory([]); // Always clear redo after new edit
  };

  const undo = async () => {
    if (undoHistory.length === 0 || !scene) return;
    const lastStep = undoHistory[undoHistory.length - 1];
    const { meshName, material } = lastStep;
    const mesh = scene.getObjectByName(meshName);
    if (!mesh) return;
    // Save current state for redo
    let currentTextureDataURL = null;
    if (mesh.material.map && mesh.material.map.image) {
      currentTextureDataURL = await getTextureDataUrl(mesh.material.map);
    }
    const currentState = serializeMaterial(mesh, 'custom', currentTextureDataURL);
    setUndoHistory((prev) => prev.slice(0, -1));
    setRedoHistory((prev) => [...prev, { meshName, material: currentState }]);
    deserializeMaterial(scene, material);
  };

  const redo = async () => {
    if (redoHistory.length === 0 || !scene) return;
    const lastStep = redoHistory[redoHistory.length - 1];
    const { meshName, material } = lastStep;
    const mesh = scene.getObjectByName(meshName);
    if (!mesh) return;
    // Save current state for undo
    let currentTextureDataURL = null;
    if (mesh.material.map && mesh.material.map.image) {
      currentTextureDataURL = await getTextureDataUrl(mesh.material.map);
    }
    const currentState = serializeMaterial(mesh, 'custom', currentTextureDataURL);
    setRedoHistory((prev) => prev.slice(0, -1));
    setUndoHistory((prev) => [...prev, { meshName, material: currentState }]);
    deserializeMaterial(scene, material);
  };

  const resetHistory = () => {
    setUndoHistory([]);
    setRedoHistory([]);
    // Also clear from IndexedDB
    saveModelState(HISTORY_KEY, { undoHistory: [], redoHistory: [] });
  };

  // --------------
  // Editing actions
  // --------------

  const applyColorToSelected = async (hex) => {
    if (!selectedMesh || !selectedMesh.material) return;
    await pushUndo(selectedMesh);
    selectedMesh.material.color = new THREE.Color(hex);
    selectedMesh.material.map = null;
    selectedMesh.material.needsUpdate = true;
  };

  const applyMaterialPreset = async (type) => {
    if (!selectedMesh) return;
    await pushUndo(selectedMesh, type);
    let material;
    switch (type) {
      case 'wood-light': material = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.8, metalness: 0.1 }); break;
      case 'wood-dark': material = new THREE.MeshStandardMaterial({ color: 0x7c3f00, roughness: 0.8, metalness: 0.1 }); break;
      case 'metal': material = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.2, metalness: 0.9 }); break;
      case 'metal-dark': material = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.2, metalness: 0.9 }); break;
      case 'plastic': material = new THREE.MeshStandardMaterial({ color: 0xbfdbfe, roughness: 0.6, metalness: 0.1 }); break;
      default: return;
    }
    selectedMesh.material = material;
    selectedMesh.material.needsUpdate = true;
  };

  const applyTextureToSelected = async (file) => {
    if (!selectedMesh || !file) return;
    await pushUndo(selectedMesh, 'custom');
    const reader = new FileReader();
    reader.onload = (e) => {
      const textureData = e.target.result;
      const texture = new THREE.TextureLoader().load(textureData);
      selectedMesh.material.map = texture;
      selectedMesh.material.needsUpdate = true;
      const newList = [...textureList, textureData];
      setTextureList(newList);
      localStorage.setItem('textureList', JSON.stringify(newList));
    };
    reader.readAsDataURL(file);
  };

  // --------------------------
  // Model loading and saving
  // --------------------------

  const handleBrowse = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file || !file.name.match(/\.(glb|gltf)$/)) return;
    const modelKey = 'uploadedModel';
    await saveModelBlob(modelKey, file);
    const blobUrl = URL.createObjectURL(file);
    setModelUrl(blobUrl);
    localStorage.setItem('modelKey', modelKey);
    resetHistory();
  }, []);

  useEffect(() => {
    const loadFromIndexedDB = async () => {
      const key = localStorage.getItem('modelKey');
      if (key) {
        const file = await getModelBlob(key);
        if (file) {
          const blobUrl = URL.createObjectURL(file);
          setModelUrl(blobUrl);

         // Material restoration is handled once the scene is available
        }
      }
    };
    loadFromIndexedDB();
  }, []);

  const collectMaterialStates = async (root) => {
    const states = [];
    const traverse = async (obj) => {
      if (obj.isMesh && obj.material) {
        let textureDataURL = null;
        if (obj.material.map) {
          textureDataURL = await getTextureDataUrl(obj.material.map);
        }
        states.push({ name: obj.name, color: obj.material.color.getHex(), textureDataURL });
      }
      for (const c of obj.children) await traverse(c);
    };
    await traverse(root);
    return states;
  };

  const saveCurrentState = async () => {
    if (!modelUrl || !scene) return;
    const materials = await collectMaterialStates(scene);
    await saveModelState('modelState', { materials, undoHistory, redoHistory, textureList });
    alert('Saved!');
  };

  // Always highlight the selected mesh (whether chosen by click or dropdown)
  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if (child.isMesh) {
        // If not MeshStandardMaterial, convert
        if (!child.material.emissive) {
          const prev = child.material;
          const stdMat = new THREE.MeshStandardMaterial({
            color: prev.color ? prev.color.clone() : new THREE.Color(0xffffff),
            map: prev.map || null,
            metalness: prev.metalness !== undefined ? prev.metalness : 0.5,
            roughness: prev.roughness !== undefined ? prev.roughness : 0.5,
          });
          child.material = stdMat;
          child.material.needsUpdate = true;
        }
        if (child === selectedMesh) {
          child.material.emissive.setHex(0x3b82f6);
          child.material.emissiveIntensity = 0.3;
        } else {
          child.material.emissive.setHex(0x000000);
          child.material.emissiveIntensity = 0;
        }
      }
    });
  }, [scene, selectedMesh]);
  


  function CameraButton({ active, label, onClick, icon }) {
    return (
      <div className="relative group">
        <button
          onClick={onClick}
          className={`flex items-center justify-center p-2 rounded transition 
            ${active ? 'bg-blue-500 text-white' : 'bg-white text-gray-700'} 
            hover:bg-blue-100 hover:text-blue-600 shadow`}
          style={{ width: 36, height: 36 }}
          aria-label={label}
        >
          {icon}
        </button>
        <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-90 pointer-events-none z-10 whitespace-nowrap">
          {label}
        </span>
      </div>
    );
  }
  // ------------------------
  // UI & Rendering
  // ------------------------
  return (
    <main className="flex flex-col h-screen overflow-hidden">
      <div className="flex flex-1 min-h-0">
      <aside className="w-16 bg-[#111827] text-white flex flex-col items-center py-4 space-y-4">
        {/* Mode toggle buttons */}
        <div className="flex flex-col gap-2 mb-6">
          <button
            onClick={() => setMode('select')}
            className={`flex items-center justify-center w-10 h-10 rounded-lg transition
              ${mode === 'select' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 hover:bg-blue-100'}
            `}
            title="Selection Mode"
          >
            <Square size={20} />
          </button>
          <button
            onClick={() => setMode('view')}
            className={`flex items-center justify-center w-10 h-10 rounded-lg transition
              ${mode === 'view' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 hover:bg-blue-100'}
            `}
            title="View Mode"
          >
            <Eye size={20} />
          </button>
        </div>
        {/* Undo */}
        <button
          className={`text-xl ${undoHistory.length > 0 ? 'hover:text-blue-400' : 'text-gray-500 cursor-not-allowed'}`}
          onClick={undo}
          disabled={undoHistory.length === 0}
          title="Undo"
        >
          <Undo2 size={22} />
        </button>
        {/* Redo */}
        <button
          className={`text-xl ${redoHistory.length > 0 ? 'hover:text-blue-400' : 'text-gray-500 cursor-not-allowed'}`}
          onClick={redo}
          disabled={redoHistory.length === 0}
          title="Redo"
        >
          <Redo2 size={22} />
        </button>
        {/* Delete */}
        <button
          className={`text-xl ${modelUrl ? 'hover:text-red-500' : 'text-gray-500 cursor-not-allowed'}`}
          onClick={() => {
            setModelUrl(null);
            setSelectedMesh(null);
            setSelectedName(null);
            setScene(null);
            resetHistory();
            localStorage.removeItem('modelKey');
          }}
          disabled={!modelUrl}
          title="Clear/Remove Model"
        >
          <Trash2 size={22} />
        </button>
        {/* Save */}
        <button
          className="text-xl hover:text-green-500"
          onClick={saveCurrentState}
          title="Save"
        >
          <Save size={22} />
        </button>
      </aside>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <div className="flex-1 relative h-full">
            <Canvas
              onCreated={({ scene, camera }) => {
                setScene(scene);
                cameraRef.current = camera;
              }}
            >
              <CameraUpdater
                view={CAMERA_VIEWS[cameraView]}
                cameraRef={cameraRef}
                controlsRef={controlsRef}
              />
              <color attach="background" args={['#f3f4f6']} />
              <ambientLight intensity={0.5} />
              <directionalLight position={[2, 2, 2]} intensity={1} />
              <Suspense fallback={null}>
                {modelUrl &&
                  <Model
                    url={modelUrl}
                    selectedMesh={selectedMesh}
                    setSelectedMesh={setSelectedMesh}
                    setSelectedName={setSelectedName}
                    setScene={setScene}
                    setMeshParts={setMeshParts}
                    mode={mode}
                  />
                }
              </Suspense>
              <OrbitControls enablePan enableZoom panSpeed={1.2} zoomSpeed={1.2} />
            </Canvas>
            {!modelUrl && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-90 text-center p-4">
                <p className="text-gray-600 mb-4">Drag and drop a .glb/.gltf file here</p>
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  <Upload size={18} /> Browse Files
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept=".glb,.gltf"
                  onChange={handleBrowse}
                  className="hidden"
                />
              </div>
            )}
          </div>
          <div className="w-full md:w-80 bg-white p-4 shadow-lg overflow-y-auto">
            {modelUrl && meshParts.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Part</label>
                <select
                  className="w-full border px-2 py-1 rounded mb-2"
                  value={selectedMesh ? selectedMesh.name : ""}
                  onChange={e => {
                    const part = meshParts.find(m => m.name === e.target.value);
                    if (part && scene) {
                      const mesh = scene.getObjectByName(part.name);
                      // Ensure highlight works!
                      if (mesh && !mesh.material.emissive) {
                        const prev = mesh.material;
                        const stdMat = new THREE.MeshStandardMaterial({
                          color: prev.color ? prev.color.clone() : new THREE.Color(0xffffff),
                          map: prev.map || null,
                          metalness: prev.metalness !== undefined ? prev.metalness : 0.5,
                          roughness: prev.roughness !== undefined ? prev.roughness : 0.5,
                        });
                        mesh.material = stdMat;
                        mesh.material.needsUpdate = true;
                      }
                      setSelectedMesh(mesh);
                      setSelectedName(mesh.name);
                    }
                    
                  }}
                >
                  <option value="" disabled>Select a part...</option>
                  {meshParts.map(part => (
                    <option key={part.uuid} value={part.name}>{part.name}</option>
                  ))}
                </select>
              </div>
            )}
            {modelUrl && selectedMesh ? (
              <>
                <h2 className="font-semibold text-lg mb-2">{selectedName}</h2>
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Color</p>
                  <div className="flex flex-wrap gap-2">
                    {["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#6b7280", "#ffffff", "#000000"].map((color) => (
                      <div
                        key={color}
                        className="w-6 h-6 rounded-full cursor-pointer border border-gray-300"
                        style={{ backgroundColor: color }}
                        onClick={() => applyColorToSelected(color)}
                      />
                    ))}
                  </div>
                </div>
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Material</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { name: 'wood-light', color: '#fde68a' },
                      { name: 'wood-dark', color: '#7c3f00' },
                      { name: 'metal', color: '#d1d5db' },
                      { name: 'metal-dark', color: '#4b5563' },
                      { name: 'plastic', color: '#bfdbfe' },
                    ].map(({ name, color }) => (
                      <button
                        key={name}
                        className="h-10 rounded shadow-inner"
                        style={{ backgroundColor: color }}
                        onClick={() => applyMaterialPreset(name)}
                      />
                    ))}
                  </div>
                </div>
                <div className="mb-2">
                  <p className="text-sm font-medium text-gray-700 mb-1">Custom Texture</p>
                  {textureList.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {textureList.map((tex, index) => (
                        <img
                          key={index}
                          src={tex}
                          alt="texture"
                          className="w-10 h-10 rounded border cursor-pointer"
                          onClick={async () => {
                            if (!selectedMesh) return;
                            await pushUndo(selectedMesh, 'custom');
                            const texture = new THREE.TextureLoader().load(tex);
                            selectedMesh.material.map = texture;
                            selectedMesh.material.needsUpdate = true;
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <label
                    htmlFor="texture-upload"
                    className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded p-4 cursor-pointer hover:border-blue-500 hover:text-blue-500"
                  >
                    <FaImage className="text-2xl mb-2" />
                    <span className="text-sm">Click or drag to upload</span>
                  </label>
                  <input
                    id="texture-upload"
                    type="file"
                    accept="image/*"
                    onChange={(e) => applyTextureToSelected(e.target.files?.[0])}
                    className="hidden"
                  />
                </div>
              </>
            ) : !modelUrl ? (
              <div className="text-center text-gray-500 mt-16">
                <FaUpload className="mx-auto text-2xl mb-2" />
                <p className="font-medium">Upload a 3D model to begin</p>
                <p className="text-sm">Supported formats: .glb, .gltf</p>
              </div>
            ) : (
              <div className="text-center text-gray-500 mt-16">
                <FaEye className="mx-auto text-2xl mb-2" />
                <p className="font-medium">Select a part to edit</p>
                <p className="text-sm">Click on any part of the 3D model to customize its appearance</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

// CameraUpdater helper: updates camera position and lookAt when view changes
function CameraUpdater({ view, cameraRef, controlsRef }) {
  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.position.set(...view.position);
      cameraRef.current.lookAt(...view.lookAt);
      cameraRef.current.updateProjectionMatrix();
      if (controlsRef.current) {
        controlsRef.current.target.set(...view.lookAt);
        controlsRef.current.update();
      }
    }
  }, [view, cameraRef, controlsRef]);
  return null;
}


function Model({ url, selectedMesh, setSelectedMesh, setSelectedName, setScene ,setMeshParts,mode}) {
  const { scene } = useGLTF(url);
  useEffect(() => {
    let meshList = [];
    scene.traverse((obj, idx) => {
      if (obj.isMesh) {
        if (!obj.name || obj.name === '') obj.name = `part_${idx}`;
        meshList.push({ name: obj.name, uuid: obj.uuid });
      }
    });
    setMeshParts(meshList);
    setScene(scene);
    window.threeScene = scene;
  }, [scene, setScene, setMeshParts]);

  const ref = useRef();
  const { gl, camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  useFrame(() => { gl.domElement.style.cursor = 'pointer'; });

  const onClick = useCallback((event) => {
    if (mode !== 'select') return;
    const bounds = gl.domElement.getBoundingClientRect();
    mouse.current.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    mouse.current.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.current.setFromCamera(mouse.current, camera);
    const intersects = raycaster.current.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
      const clicked = intersects[0].object;
      // 🟢 Ensure always using MeshStandardMaterial for highlight support
      if (!clicked.material.emissive) {
        const prev = clicked.material;
        const stdMat = new THREE.MeshStandardMaterial({
          color: prev.color ? prev.color.clone() : new THREE.Color(0xffffff),
          map: prev.map || null,
          metalness: prev.metalness !== undefined ? prev.metalness : 0.5,
          roughness: prev.roughness !== undefined ? prev.roughness : 0.5,
        });
        clicked.material = stdMat;
        clicked.material.needsUpdate = true;
      }
      setSelectedMesh(clicked);
      setSelectedName(clicked.name || 'Unnamed Part');
    }
  }, [camera, gl, scene, setSelectedMesh, setSelectedName, mode]);
  
  
  // 🔥 Highlight effect
  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if (child.isMesh && child.material && child.material.emissive) {
        if (child === selectedMesh) {
          child.material.emissive.setHex(0x3b82f6);
          child.material.emissiveIntensity = 0.3;
        } else {
          child.material.emissive.setHex(0x000000);
          child.material.emissiveIntensity = 0;
        }
      }
    });
  }, [scene, selectedMesh]);
  
  
  
  useFrame(() => {
    scene.traverse((child) => {
      if (child.isMesh && child !== selectedMesh && child.material?.emissive) {
        child.material.emissive.setHex(0x000000);
        child.material.emissiveIntensity = 0;
      }
      
    });
    if (gl && gl.domElement) {
      gl.domElement.style.cursor = mode === 'select' ? 'pointer' : 'grab';
    }
  });

  // Restore material state on load
  useEffect(() => {
    if (!scene) return;
    (async () => {
      const saved = await getModelState('modelState');
      if (!saved) return;
      saved.materials.forEach(({ name, color, textureDataURL }) => {
        const mesh = scene.getObjectByName(name);
        if (!mesh) return;
        mesh.material.color = new THREE.Color(color);
        if (textureDataURL) {
          mesh.material.map = new THREE.TextureLoader().load(textureDataURL);
        }
        mesh.material.needsUpdate = true;
      });
    })();
  }, [scene]);
  // Auto-unselect if user switches to view mode
  useEffect(() => {
    if (mode === 'view') {
      setSelectedMesh(null);
      setSelectedName(null);
    }
  }, [mode]);

  useEffect(() => {
    if (!scene) return;
    scene.traverse((child, idx) => {
      if (child.isMesh) {
        // Always assign a unique material
        let prev = child.material;
        if (!(prev instanceof THREE.MeshStandardMaterial)) {
          // If the original is not standard, convert
          prev = new THREE.MeshStandardMaterial({
            color: prev.color ? prev.color.clone() : new THREE.Color(0xffffff),
            map: prev.map || null,
            metalness: prev.metalness !== undefined ? prev.metalness : 0.5,
            roughness: prev.roughness !== undefined ? prev.roughness : 0.5,
          });
        } else {
          // Otherwise, clone it so it's unique
          prev = prev.clone();
        }
        child.material = prev;
        child.material.needsUpdate = true;
      }
    });
  }, [scene]);
  
  return <primitive object={scene} ref={ref} onClick={onClick} dispose={null} />;
}
