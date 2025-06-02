'use client';

import { useRef, useState, useCallback, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {FaSave, FaUndoAlt, FaRedoAlt, FaTrash, FaUpload, FaImage, FaEye } from 'react-icons/fa';
import { saveModelBlob, getModelBlob,saveModelState, getModelState } from '../app/utils/idb'; // top of file

export default function CanvasViewer() {
  const [selectedMesh, setSelectedMesh] = useState(null);
  const [scene, setScene] = useState(null);
  const [selectedName, setSelectedName] = useState(null);
  const [modelUrl, setModelUrl] = useState(null);
  const [undoHistory, setUndoHistory] = useState([]);
  const [redoHistory, setRedoHistory] = useState([]);
  const [textureList, setTextureList] = useState([]);
  

  useEffect(() => {
    setModelUrl(localStorage.getItem('modelUrl') || null);
    setUndoHistory(JSON.parse(localStorage.getItem('undoHistory') || '[]'));
    setRedoHistory(JSON.parse(localStorage.getItem('redoHistory') || '[]'));
    setTextureList(JSON.parse(localStorage.getItem('textureList') || '[]'));
  }, []);

  useEffect(() => {
    localStorage.setItem('undoHistory', JSON.stringify(undoHistory));
    localStorage.setItem('redoHistory', JSON.stringify(redoHistory));
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
  }, [scene]);
  

  const serializeMaterial = (mesh, type='custom', textureDataURL=null) => ({
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

  const pushUndo = async (mesh, preset = 'custom') => {
    if (!mesh || !mesh.material) return;
    
    // Capture the CURRENT state before making changes
    let currentTextureDataURL = null;
    if (mesh.material.map && mesh.material.map.image) {
      currentTextureDataURL = await getTextureDataUrl(mesh.material.map);
    }
    
    const currentState = serializeMaterial(mesh, preset, currentTextureDataURL);
    setUndoHistory((prev) => [...prev, currentState]);
    setRedoHistory([]); // Clear redo history when new action is performed
  };

  const undo = async () => {
    if (undoHistory.length === 0 || !scene || !selectedMesh) return;
    
    // Get the state to restore
    const stateToRestore = undoHistory[undoHistory.length - 1];
    
    // Capture current state for redo
    let currentTextureDataURL = null;
    if (selectedMesh.material.map && selectedMesh.material.map.image) {
      currentTextureDataURL = await getTextureDataUrl(selectedMesh.material.map);
    }
    const currentState = serializeMaterial(selectedMesh, 'custom', currentTextureDataURL);
    
    // Update histories
    setUndoHistory((prev) => prev.slice(0, -1));
    setRedoHistory((prev) => [...prev, currentState]);
    
    // Restore the previous state
    deserializeMaterial(scene, stateToRestore);
  };

  const redo = () => {
    if (redoHistory.length === 0 || !scene) return;
    
    // Get the state to restore
    const stateToRestore = redoHistory[redoHistory.length - 1];
    
    // Update histories
    setRedoHistory((prev) => prev.slice(0, -1));
    setUndoHistory((prev) => [...prev, stateToRestore]);
    
    // Restore the state
    deserializeMaterial(scene, stateToRestore);
  };

  const resetHistory = () => {
    setUndoHistory([]);
    setRedoHistory([]);
    localStorage.removeItem('undoHistory');
    localStorage.removeItem('redoHistory');
  };

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
  
          // Wait until scene is ready, then apply saved materials
          setTimeout(async () => {
            const saved = await getModelState('modelState');
            if (saved && window.threeScene) {
              const { materials } = saved;
              materials.forEach(({ uuid, color, texture }) => {
                const mesh = window.threeScene.getObjectByProperty('uuid', uuid);
                if (mesh && mesh.material) {
                  mesh.material.color = new THREE.Color(color);
                  if (texture) {
                    const tex = new THREE.TextureLoader().load(texture);
                    mesh.material.map = tex;
                  }
                  mesh.material.needsUpdate = true;
                }
              });
            }
          }, 1000);// Delay a bit to ensure scene is mounted
        }
      }
    };
    loadFromIndexedDB();
  }, []);
  
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
    console.log('🔴 SAVED materials:', materials.map(m => m.name));
    await saveModelState('modelState', { materials, undoHistory, redoHistory, textureList });
    alert('Saved!');

  };
  




  return (
    <main className="flex flex-col h-screen overflow-hidden">
      <div className="flex flex-1 min-h-0">
        <aside className="w-16 bg-[#111827] text-white flex flex-col items-center py-4 space-y-6">
          <button 
            className={`text-xl ${undoHistory.length > 0 ? 'hover:text-blue-400' : 'text-gray-500 cursor-not-allowed'}`} 
            onClick={undo}
            disabled={undoHistory.length === 0}
          >
            <FaUndoAlt />
          </button>
          <button 
            className={`text-xl ${redoHistory.length > 0 ? 'hover:text-blue-400' : 'text-gray-500 cursor-not-allowed'}`} 
            onClick={redo}
            disabled={redoHistory.length === 0}
          >
            <FaRedoAlt />
          </button>
          <button
            className={`text-xl ${modelUrl ? 'hover:text-red-500' : 'text-gray-500 cursor-not-allowed'}`}
            onClick={() => {
              setModelUrl(null);
              setSelectedMesh(null);
              setSelectedName(null);
              setScene(null);
              resetHistory();
              // Remove from localStorage if needed:
              localStorage.removeItem('modelKey');
            }}
            disabled={!modelUrl}
          >
            <FaTrash />
          </button>
          <button className="text-xl hover:text-green-500" onClick={saveCurrentState}>
            <FaSave />
          </button>

        </aside>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <div className="flex-1 relative h-full">
            {/* <Canvas camera={{ position: [0, 0, 5], fov: 45 }} onCreated={({ scene }) => (window.threeScene = scene)}> */}
            <Canvas camera={{ position: [0, 0, 5], fov: 45 }} onCreated={({ scene }) => setScene(scene)}>
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
            />            
              }
            </Suspense>

              <OrbitControls enablePan enableZoom panSpeed={1.2} zoomSpeed={1.2} />
            </Canvas>

            {!modelUrl && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-90 text-center p-4">
                <p className="text-gray-600 mb-4">Drag and drop a .glb/.gltf file here</p>
                <label htmlFor="file-upload" className="cursor-pointer flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                  <FaUpload /> Browse Files
                </label>
                <input id="file-upload" type="file" accept=".glb,.gltf" onChange={handleBrowse} className="hidden" />
              </div>
            )}
          </div>

          <div className="w-full md:w-80 bg-white p-4 shadow-lg overflow-y-auto">
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

function Model({ url, selectedMesh, setSelectedMesh, setSelectedName, setScene }) {
  const { scene } = useGLTF(url);
  useEffect(() => {
    scene.traverse((obj, idx) => {
      if (obj.isMesh) {
        // if it has no name, give it one based on index
        if (!obj.name || obj.name === '') obj.name = `part_${idx}`;
      }
    });
    setScene(scene);
  }, [scene, setScene]);
  
  const ref = useRef();
  const { gl, camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());;

  useFrame(() => { gl.domElement.style.cursor = 'pointer'; });

  const onClick = useCallback((event) => {
    const bounds = gl.domElement.getBoundingClientRect();
    mouse.current.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    mouse.current.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.current.setFromCamera(mouse.current, camera);
    const intersects = raycaster.current.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
      const clicked = intersects[0].object;
      setSelectedMesh(clicked);
      setSelectedName(clicked.name || 'Unnamed Part');
      if (clicked.material?.emissive) {
        clicked.material.emissive.setHex(0x3b82f6);
        clicked.material.emissiveIntensity = 0.3;
      }
    }
  }, [camera, gl, scene, setSelectedMesh, setSelectedName]);

  useFrame(() => {
    scene.traverse((child) => {
      if (child.isMesh && child !== selectedMesh && child.material?.emissive) {
        child.material.emissive.setHex(0x000000);
        child.material.emissiveIntensity = 0;
      }
    });
  });
// Restoration (inside your Model useEffect)
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
    scene.traverse(obj => {
      if (obj.isMesh) console.log(' •', JSON.stringify(obj.name));
    });
  
  })();
}, [scene]);

  

  return <primitive object={scene} ref={ref} onClick={onClick} dispose={null} />;
}
