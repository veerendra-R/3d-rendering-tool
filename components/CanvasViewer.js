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
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { openDB } from 'idb';
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import GlobalLoader from "../components/GlobalLoader";

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
  const [versions, setVersions] = useState({});
  const [activeVersion, setActiveVersion] = useState('Version1');
  const [originalMaterials, setOriginalMaterials] = useState([]);
  const canvasWrapperRef = useRef(null);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const router = useRouter();
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);

  // Camera controls
  const cameraRef = useRef();
  const controlsRef = useRef();
  const [cameraView, setCameraView] = useState('perspective');
  async function waitForSceneTextures(scene) {
    const promises = [];

    scene.traverse((obj) => {
      if (obj.isMesh && obj.material && obj.material.map) {
        const tex = obj.material.map;
        if (!tex.image) {
          // Texture is still loading
          promises.push(
            new Promise((resolve) => {
              tex.onceReady = () => resolve();
              const checkLoaded = () => {
                if (tex.image) resolve();
                else setTimeout(checkLoaded, 100);
              };
              checkLoaded();
            })
          );
        }
      }
    });

    if (promises.length) {
      await Promise.all(promises);
    }
  }
  function loadTex(url) {
    const tex = new THREE.TextureLoader().load(url);
    tex.encoding = THREE.sRGBEncoding;
    tex.flipY = false;
    tex.needsUpdate = true;
    return tex;
  }
  useEffect(() => {
    (async () => {
      const savedOriginal = await getModelState('originalModelState');
      if (savedOriginal?.materials?.length) {
        const incomplete = savedOriginal.materials.some(m => !m.textureDataURL && !m.color);
        if (incomplete) {
          console.log('Rebuilding baseline because some materials had no textures');
          await waitForSceneTextures(scene);
          const raw = await collectMaterialStates(scene);
          setOriginalMaterials(raw);
          await saveModelState('originalModelState', { materials: raw });
        } else {
          setOriginalMaterials(savedOriginal.materials);
        }
      }
    })();
  }, [scene]);

  useEffect(() => {
    const badUrl = localStorage.getItem('modelUrl');
    if (badUrl && badUrl.startsWith('blob:')) {
      localStorage.removeItem('modelUrl');
    }
  }, []);
  useEffect(() => {
    refreshModelUrlFromDB();
  }, []);

  useEffect(() => {
    const loadFromIndexedDB = async () => {
      const key = localStorage.getItem('modelKey');
      if (key) {
        const file = await getModelBlob(key);
        if (file) {
          const blobUrl = URL.createObjectURL(file);
          setModelUrl(blobUrl);
        }
      }
    };
    loadFromIndexedDB();
  }, []);

  // Only initialize from IndexedDB, not localStorage
  useEffect(() => {
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
        try {
          mesh.material.color = new THREE.Color(color);
          if (textureDataURL) {
            const tex = ((url) => {
              const tex = loadTex(url);
              tex.encoding = THREE.sRGBEncoding;
              tex.flipY = false;
              return tex;
            })(textureDataURL);
            tex.encoding = THREE.sRGBEncoding;
            tex.flipY = false;
            mesh.material.map = tex;
            mesh.material.needsUpdate = true;
            tex.needsUpdate = true;

          } else {
            mesh.material.map = null;
          }
          mesh.material.needsUpdate = true;
        } catch (e) {
          console.warn('restore material failed for', name, e);
        }
      });
    };
    restore();
  }, [scene, modelUrl]);

  useEffect(() => {
    (async () => {
      const savedVersions = await getModelState('modelVersions');
      if (savedVersions) {
        setVersions(savedVersions.versions || {});
        setActiveVersion(savedVersions.activeVersion || 'Version1');
      } else {
        // Initialize with one default version
        setVersions({ Version1: createEmptyVersion() });
        setActiveVersion('Version1');
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeVersion || !versions[activeVersion] || !scene) return;

    const v = versions[activeVersion];

    setUndoHistory(v.undoHistory || []);
    setRedoHistory(v.redoHistory || []);
    setTextureList(v.textureList || []);

    // Restore version-specific materials
    if (v.materials?.length) {
      v.materials.forEach(({ name, color, textureDataURL }) => {
        const mesh = scene.getObjectByName(name);
        if (!mesh) return;
        try {
          mesh.material.color = new THREE.Color(color);
          
          if (textureDataURL) {
            const tex = ((url) => {
                  const tex = loadTex(url);
                  tex.encoding = THREE.sRGBEncoding;
                  tex.flipY = false;
                  return tex;
                })(textureDataURL);
            tex.encoding = THREE.sRGBEncoding;
            tex.flipY = false;
            mesh.material.map = tex;
            mesh.material.needsUpdate = true;
            tex.needsUpdate = true;

          } else {
            mesh.material.map = null;
          }
          mesh.material.needsUpdate = true;
        } catch (e) {
          console.warn('apply version material failed for', name, e);
        }
      });
    }
  }, [activeVersion, scene, versions]);

  useEffect(() => {
    saveModelState('modelVersions', { versions, activeVersion });
  }, [versions, activeVersion]);

  useEffect(() => {
    if (!scene) return;

    const captureBaseline = async () => {
      // Wait until all textures are fully loaded
      await waitForSceneTextures(scene);

      // Then collect the complete material snapshot (color + texture)
      const raw = await collectMaterialStates(scene);
      setOriginalMaterials(raw);
      await saveModelState('originalModelState', { materials: raw });
    };

    if (originalMaterials.length === 0) {
      captureBaseline();
    }
  }, [scene]);



  // -----------------
  // Utility functions
  // -----------------

  const serializeMaterial = (mesh, type = 'custom', textureDataURL = null) => ({
    name: mesh.name,
    uuid: mesh.uuid,
    color: mesh.material.color.clone().convertLinearToSRGB().getHex(),
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
      color: new THREE.Color(saved.color).convertSRGBToLinear(),
      roughness: saved.roughness || 0.5,
      metalness: saved.metalness || 0.5,
    });

    if (saved.textureDataURL) {
      const texture = ((url) => {
        const tex = loadTex(url);
        tex.encoding = THREE.sRGBEncoding;
        tex.flipY = false;
        return tex;
      })(saved.textureDataURL);
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

    // Save current for redo
    let currentTextureDataURL = null;
    if (mesh.material.map && mesh.material.map.image) {
      currentTextureDataURL = await getTextureDataUrl(mesh.material.map);
    }
    const currentState = serializeMaterial(mesh, 'custom', currentTextureDataURL);

    setUndoHistory((prev) => prev.slice(0, -1));
    setRedoHistory((prev) => [...prev, { meshName, material: currentState }]);

    deserializeMaterial(scene, material);

    await updateActiveVersionState();
  };

  const redo = async () => {
    if (redoHistory.length === 0 || !scene) return;
    const lastStep = redoHistory[redoHistory.length - 1];
    const { meshName, material } = lastStep;
    const mesh = scene.getObjectByName(meshName);
    if (!mesh) return;

    // Save current for undo
    let currentTextureDataURL = null;
    if (mesh.material.map && mesh.material.map.image) {
      currentTextureDataURL = await getTextureDataUrl(mesh.material.map);
    }
    const currentState = serializeMaterial(mesh, 'custom', currentTextureDataURL);

    setRedoHistory((prev) => prev.slice(0, -1));
    setUndoHistory((prev) => [...prev, { meshName, material: currentState }]);

    deserializeMaterial(scene, material);
    await updateActiveVersionState();
  };

  const resetHistory = () => {
    setUndoHistory([]);
    setRedoHistory([]);
    saveModelState(HISTORY_KEY, { undoHistory: [], redoHistory: [] });
  };
  const refreshModelUrlFromDB = async () => {
    const key = localStorage.getItem('modelKey');
    if (!key) return;
    const file = await getModelBlob(key);
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    setModelUrl(blobUrl);
  };

  function createEmptyVersion(materials = [], textureList = []) {
    return {
      // do NOT store modelUrl here (blob URLs are ephemeral)
      materials,
      undoHistory: [],
      redoHistory: [],
      textureList
    };
  }



  const deleteVersion = async (versionName) => {
    const versionKeys = Object.keys(versions);

    // Create a confirmation toast
    toast.custom((t) => (
      <div className="bg-white border border-gray-200 shadow-lg rounded-xl p-4 flex flex-col gap-3 w-[280px]">
        <p className="text-gray-800 font-medium text-center">
          {versionKeys.length <= 1
            ? `Delete ${versionName}? This will clear all data.`
            : `Delete ${versionName}?`}
        </p>

        <div className="flex justify-center gap-3 mt-2">
          <button
            className="px-3 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200 transition"
            onClick={() => toast.dismiss(t.id)}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-sm rounded-md bg-red-500 text-white hover:bg-red-600 transition"
            onClick={async () => {
              toast.dismiss(t.id);
              const toastId = toast.loading("Deleting version...");

              try {
                if (versionKeys.length <= 1) {
                  await clearAllStorageAndDB();
                  localStorage.clear();
                  setVersions({});
                  setActiveVersion("Version1");
                  setModelUrl(null);
                  setScene(null);
                  setSelectedMesh(null);
                  setUndoHistory([]);
                  setRedoHistory([]);
                  if (scene) scene.clear();
                  toast.success("All versions and model data cleared.", {
                    id: toastId,
                  });
                  return;
                }

                // Normal version delete flow
                const updated = { ...versions };
                delete updated[versionName];

                // Reindex remaining versions
                const reindexed = {};
                Object.keys(updated)
                  .sort((a, b) => {
                    const na = parseInt(a.replace("Version", "")) || 0;
                    const nb = parseInt(b.replace("Version", "")) || 0;
                    return na - nb;
                  })
                  .forEach((oldName, i) => {
                    const newName = `Version${i + 1}`;
                    reindexed[newName] = updated[oldName];
                  });

                const nextActive = Object.keys(reindexed)[0];
                setVersions(reindexed);
                setActiveVersion(nextActive);

                await saveModelState("modelVersions", {
                  versions: reindexed,
                  activeVersion: nextActive,
                });

                // Apply new version materials
                if (scene && reindexed[nextActive]?.materials) {
                  scene.traverse((child) => {
                    if (child.isMesh) {
                      const base = reindexed[nextActive].materials.find(
                        (m) => m.name === child.name
                      );
                      const mat = new THREE.MeshStandardMaterial({
                        color: new THREE.Color(base?.color || 0xffffff),
                      });
                      if (base?.textureDataURL) {
                        mat.map = ((url) => {
                          const tex = loadTex(url);
                          tex.encoding = THREE.sRGBEncoding;
                          tex.flipY = false;
                          return tex;
                        })(base.textureDataURL);
                      }
                      child.material = mat;
                      child.material.needsUpdate = true;
                    }
                  });
                }

                toast.success(`${versionName} deleted successfully.`, {
                  id: toastId,
                });
              } catch (err) {
                console.error("Delete version failed:", err);
                toast.error("Failed to delete version.", { id: toastId });
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>
    ));
  };



  const handleAddVersion = async () => {
    const versionCount = Object.keys(versions).length;
    if (versionCount >= 5) {
      alert('You can only create up to 5 versions.');
      return;
    }

    await updateActiveVersionState();

    // Get baseline materials
    let baseMaterials = [];
    if (originalMaterials.length) {
      baseMaterials = originalMaterials;
    } else if (versions[activeVersion]?.materials?.length) {
      baseMaterials = versions[activeVersion].materials;
    } else if (scene) {
      baseMaterials = await collectMaterialStates(scene);
    }

    const newName = `Version${versionCount + 1}`;
    const clonedMaterials = baseMaterials.map((m) => ({ ...m }));
    const newVersion = createEmptyVersion(clonedMaterials, []);

    // Preserve existing order and append at end
    const updatedVersions = { ...versions, [newName]: newVersion };

    setVersions(updatedVersions);
    setActiveVersion(newName);

    await saveModelState('modelVersions', {
      versions: updatedVersions,
      activeVersion: newName,
    });

    await refreshModelUrlFromDB();
  };



  const reloadOriginalModel = async () => {
    const key = localStorage.getItem('modelKey');
    if (!key) return null;
    const file = await getModelBlob(key);
    if (!file) return null;
    const blobUrl = URL.createObjectURL(file);

    try {
      const loader = new GLTFLoader();
      return await new Promise((resolve, reject) => {
        loader.load(
          blobUrl,
          (gltf) => {
            const cloned = gltf.scene.clone(true);
            cloned.traverse((obj) => {
              if (obj.isMesh && obj.material && obj.material.clone) {
                obj.material = obj.material.clone();
                obj.material.needsUpdate = true;
              }
            });
            URL.revokeObjectURL(blobUrl);
            resolve(cloned);
          },
          undefined,
          (err) => {
            console.error('GLTF load failed:', err);
            URL.revokeObjectURL(blobUrl);
            reject(err);
          }
        );
      });
    } catch (err) {
      console.error('reloadOriginalModel error:', err);
      return null;
    }
  };

  // helper: explicitly remove specific keys and blob entries used by the app
  async function deleteModelStateKey(keyName) {
    try {
      const db = await openDB('modelDB', 1);
      if (db.objectStoreNames.contains('keyval')) {
        const tx = db.transaction('keyval', 'readwrite');
        await tx.objectStore('keyval').delete(keyName);
        await tx.done;
      } else {
        for (const storeName of db.objectStoreNames) {
          const tx = db.transaction(storeName, 'readwrite');
          await tx.objectStore(storeName).delete(keyName);
          await tx.done;
        }
      }
      db.close();
      console.log(`Deleted key ${keyName} from modelDB`);
    } catch (err) {
      console.warn('deleteModelStateKey failed for', keyName, err);
    }
  }

  async function deleteUploadedBlob(keyName) {
    try {
      const db = await openDB('modelDB', 1);
      if (db.objectStoreNames.contains('blobs')) {
        const tx = db.transaction('blobs', 'readwrite');
        await tx.objectStore('blobs').delete(keyName);
        await tx.done;
        console.log(`Deleted blob ${keyName}`);
      }
      db.close();
    } catch (err) {
      console.warn('deleteUploadedBlob failed', err);
    }
  }

  async function clearAllStorageAndDB() {
    try {
      const keys = ['modelVersions','modelState','originalModelState', HISTORY_KEY, 'uploadedModel', 'textureList', 'modelKey'];
      await Promise.all(keys.map(k => deleteModelStateKey(k)));
      await deleteUploadedBlob('uploadedModel');

      try { localStorage.clear(); sessionStorage.clear(); } catch (e) { console.warn(e); }

      try {
        const db = await openDB('modelDB', 1);
        for (const storeName of db.objectStoreNames) {
          const tx = db.transaction(storeName, 'readwrite');
          await tx.objectStore(storeName).clear();
          await tx.done;
        }
        db.close();
      } catch (e) { console.warn('clear modelDB stores failed', e); }

      if ('databases' in indexedDB) {
        const dbs = await indexedDB.databases();
        for (const dbInfo of dbs) {
          if (dbInfo.name) {
            await new Promise((resolve) => {
              const req = indexedDB.deleteDatabase(dbInfo.name);
              req.onsuccess = resolve;
              req.onerror = resolve;
              req.onblocked = resolve;
            });
          }
        }
      } else {
        try { indexedDB.deleteDatabase('modelDB'); } catch (e) { /* ignore */ }
      }

      setModelUrl(null);
      setSelectedMesh(null);
      setSelectedName(null);
      setScene(null);
      setVersions({});
      setActiveVersion('Version1');
      setTextureList([]);
      setUndoHistory([]);
      setRedoHistory([]);
      setOriginalMaterials([]);
      setMeshParts([]);
      if (window.threeScene) {
        try { window.threeScene.clear(); } catch(e) {}
        delete window.threeScene;
      }

      await new Promise(r => setTimeout(r, 150));
      console.log('All app data cleared');
    } catch (err) {
      console.error('clearAllStorageAndDB failed', err);
    }
  }



  // --------------
  // Editing actions
  // --------------

  const applyColorToSelected = async (hex) => {
    if (!selectedMesh || !selectedMesh.material) return;
    await pushUndo(selectedMesh);
    selectedMesh.material.color = new THREE.Color(hex);
    selectedMesh.material.map = null;
    selectedMesh.material.needsUpdate = true;
    await updateActiveVersionState();
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
    await updateActiveVersionState();
  };

  const applyTextureToSelected = async (file) => {
    if (!selectedMesh || !file) return;
    await pushUndo(selectedMesh, 'custom');
    const reader = new FileReader();
    reader.onload = (e) => {
      const textureData = e.target.result;
      const texture = ((url) => {
        const tex = loadTex(url);
        tex.encoding = THREE.sRGBEncoding;
        tex.flipY = false;
        return tex;
      })(textureData);
      selectedMesh.material.map = texture;
      selectedMesh.material.needsUpdate = true;
      const newList = [...textureList, textureData];
      setTextureList(newList);
      localStorage.setItem('textureList', JSON.stringify(newList));
      updateActiveVersionState();
    };
    reader.readAsDataURL(file);
  };

  const applyMaterialsIfDifferent = (root, savedMaterials = []) => {
    for (const saved of savedMaterials) {
      const mesh = root.getObjectByName(saved.name);
      if (!mesh) continue;

      const currentHex = mesh.material?.color?.getHex?.();
      const wantHex = Number(saved.color);

      const currentTex = mesh.material?.map?.image ? true : false;
      const wantTex = !!saved.textureDataURL;

      if (currentHex !== wantHex || currentTex !== wantTex) {
        const newMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(saved.color).convertSRGBToLinear(),
          roughness: saved.roughness ?? 0.5,
          metalness: saved.metalness ?? 0.5,
        });
        if (saved.textureDataURL) newMat.map = ((url) => {
          const tex = loadTex(url);
          tex.encoding = THREE.sRGBEncoding;
          tex.flipY = false;
          return tex;
        })(saved.textureDataURL);
        mesh.material = newMat;
        mesh.material.needsUpdate = true;
      }
    }
  };

  // --------------------------
  // Model loading and saving
  // --------------------------

const handleBrowse = useCallback(async (e) => {
  const file = e.target.files[0];
  if (!file || !file.name.match(/\.(glb|gltf)$/)) return;
  
  setIsGlobalLoading(true);

  const modelKey = "uploadedModel";
  await saveModelBlob(modelKey, file);
  const blobUrl = URL.createObjectURL(file);
  setModelUrl(blobUrl);
  localStorage.setItem("modelKey", modelKey);
  resetHistory();

  // slight delay to make loader smooth
  setTimeout(() => setIsGlobalLoading(false), 1200);
}, []);




  const collectMaterialStates = async (root) => {
    const states = [];
    const traverse = async (obj) => {
      if (obj.isMesh && obj.material) {
        let textureDataURL = null;
        if (obj.material.map) {
          if (textureDataURL === null && obj.material.map && obj.material.map.image)
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
    if (!modelUrl || !scene) {
      toast.error("No model loaded.", {
        description: "Upload a 3D model before saving a version.",
      });
      return;
    }

    // Start loading toast
    setIsGlobalLoading(true);
    toast.message(`Saving ${activeVersion}...`);

    try {
      // Collect all material data from scene
      const materials = await collectMaterialStates(scene);

      // Update state in memory
      setVersions((prev) => ({
        ...prev,
        [activeVersion]: {
          ...prev[activeVersion],
          materials,
          undoHistory,
          redoHistory,
          textureList,
        },
      }));

      // Persist to IndexedDB
      await saveModelState("modelVersions", {
        versions: {
          ...versions,
          [activeVersion]: {
            modelUrl,
            materials,
            undoHistory,
            redoHistory,
            textureList,
          },
        },
        activeVersion,
      });

      // Optional: Refresh the blob URL from DB
      await refreshModelUrlFromDB();

      // Success notification
      toast.success(`${activeVersion} saved successfully!`, {
        id: toastId,
        description: "Your version changes are stored safely in local storage.",
      });
    } catch (err) {
      console.error("Save failed:", err);
      toast.error("Failed to save version.", {
        id: toastId,
        description: "An error occurred while saving your progress.",
      });
    }
  };


  const updateActiveVersionState = async () => {
    if (!scene || !activeVersion) return;
    const materials = await collectMaterialStates(scene);

    setVersions(prev => {
      const next = {
        ...prev,
        [activeVersion]: {
          ...prev[activeVersion],
          modelUrl,
          materials,
          undoHistory,
          redoHistory,
          textureList,
        }
      };
      saveModelState('modelVersions', { versions: next, activeVersion });
      return next;
    });
  };


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

  return (
    <main className="flex flex-col h-screen bg-[#FAF4ED] text-gray-800 overflow-hidden">
      {isModelLoading && (
          <div className="absolute inset-0 z-[9999] flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="w-12 h-12 border-4 border-t-[#4ADE80] border-gray-300 rounded-full animate-spin mb-3" />
            <p className="text-gray-700 font-medium">Publishing your model...</p>
          </div>
        )}

      {/* --- Header --- */}
      <header className="flex justify-between items-center px-8 py-4 bg-white shadow-sm border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-800">
          3D Model Customizer
        </h1>
        <button 
          className="bg-[#4ADE80] text-white px-5 py-2 rounded-full font-medium hover:bg-[#3fd270] transition"
          onClick={() => {
            setIsGlobalLoading(true);
            toast.promise(
              new Promise((resolve) => {
                setTimeout(() => {
                  router.push("/marketplace");
                  resolve();
                }, 1500);
              }),
              {
                loading: "Publishing model...",
                success: "Model published successfully!",
                error: "Failed to publish model.",
              }
            );
            setTimeout(() => setIsGlobalLoading(false), 1500);
          }}
        >
          Publish
        </button>
      </header>

      {/* --- Main Layout --- */}
      <div className="flex flex-1 min-h-0">
        
        {/* --- Sidebar (Tools) --- */}
        <aside className="w-20 bg-white border-r border-gray-200 flex flex-col items-center py-6 space-y-6 shadow-sm">
          <div className="flex flex-col gap-4">
            <button
              onClick={() => setMode('select')}
              className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all shadow-sm
                ${mode === 'select'
                  ? 'bg-[#4ADE80] text-white shadow-md scale-105'
                  : 'bg-white text-gray-600 hover:bg-green-50 hover:text-[#4ADE80]'}
              `}
              title="Selection Mode"
            >
              <Square size={20} />
            </button>

            <button
              onClick={() => setMode('view')}
              className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all shadow-sm
                ${mode === 'view'
                  ? 'bg-[#4ADE80] text-white shadow-md scale-105'
                  : 'bg-white text-gray-600 hover:bg-green-50 hover:text-[#4ADE80]'}
              `}
              title="View Mode"
            >
              <Eye size={20} />
            </button>
          </div>

          <button
            onClick={undo}
            disabled={undoHistory.length === 0}
            className={`p-2 transition ${undoHistory.length > 0
              ? 'text-[#4ADE80] hover:text-[#3fd270]'
              : 'text-gray-300 cursor-not-allowed'}`}
            title="Undo"
          >
            <Undo2 size={22} />
          </button>

          <button
            onClick={redo}
            disabled={redoHistory.length === 0}
            className={`p-2 transition ${redoHistory.length > 0
              ? 'text-[#4ADE80] hover:text-[#3fd270]'
              : 'text-gray-300 cursor-not-allowed'}`}
            title="Redo"
          >
            <Redo2 size={22} />
          </button>

          <button
            onClick={saveCurrentState}
            className="p-2 text-[#4ADE80] hover:text-[#3fd270] transition"
            title="Save"
          >
            <Save size={22} />
          </button>

          <button
            onClick={async () => {
              if (!confirm('Delete the entire model and all saved versions?')) return;
              await clearAllStorageAndDB();
              setModelUrl(null);
            }}
            className="p-2 text-red-400 hover:text-red-500 transition"
            title="Clear Model"
          >
            <Trash2 size={22} />
          </button>
        </aside>

        {/* --- Center 3D Canvas Area --- */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <div className="flex-1 relative overflow-hidden bg-[#FAF4ED]">
            <div ref={canvasWrapperRef} className="absolute inset-0">
              
              <Canvas
                className="w-full h-full"
                gl={{
                  physicallyCorrectLights: true,
                  outputEncoding: THREE.sRGBEncoding,
                  toneMapping: THREE.ACESFilmicToneMapping,
                  toneMappingExposure: 1,
                }}
                onCreated={({ scene, camera, gl }) => {
                  setScene(scene);
                  cameraRef.current = camera;
                  gl.outputEncoding = THREE.sRGBEncoding;
                  gl.toneMapping = THREE.ACESFilmicToneMapping;
                  gl.toneMappingExposure = 1;
                }}
              >
                <CameraUpdater
                  view={CAMERA_VIEWS[cameraView]}
                  cameraRef={cameraRef}
                  controlsRef={controlsRef}
                />
                <color attach="background" args={['#FAF4ED']} />
                <ambientLight intensity={0.6} />
                <directionalLight position={[2, 2, 2]} intensity={1.2} />
                <hemisphereLight skyColor="#ffffff" groundColor="#b9b9b9" intensity={0.6} />
                <Suspense fallback={null}>
                  {modelUrl && (
                    <Model
                      url={modelUrl}
                      selectedMesh={selectedMesh}
                      setSelectedMesh={setSelectedMesh}
                      setSelectedName={setSelectedName}
                      setScene={setScene}
                      setMeshParts={setMeshParts}
                      mode={mode}
                      activeVersion={activeVersion}
                      versionData={versions[activeVersion]}
                      key={activeVersion}
                    />
                  )}
                </Suspense>
                <OrbitControls enablePan enableZoom panSpeed={1.2} zoomSpeed={1.2} />
              </Canvas>
              {isModelLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm z-50">
                  <div className="w-10 h-10 border-4 border-t-[#4ADE80] border-gray-300 rounded-full animate-spin" />
                  <span className="ml-3 text-gray-700 font-medium">Loading model...</span>
                </div>
              )}
              {/* Empty State */}
              {!modelUrl && !isModelLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 text-center p-4 rounded-xl shadow-inner">
                  <p className="text-gray-600 mb-4">Drag and drop a .glb/.gltf file here</p>
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex items-center gap-2 bg-[#4ADE80] text-white px-5 py-2 rounded-full font-medium hover:bg-[#3fd270] transition"
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

              {/* Version Bar */}
              {modelUrl && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50
                                flex flex-wrap justify-center items-center gap-2
                                max-w-[90%] bg-white/90 backdrop-blur-md px-4 py-2
                                rounded-2xl shadow-lg border border-gray-200">
                  {Object.keys(versions)
                    .sort((a, b) => {
                      const na = parseInt(a.replace('Version', '')) || 0;
                      const nb = parseInt(b.replace('Version', '')) || 0;
                      return na - nb;
                    })
                    .map((v) => (
                      <div key={v} className="flex items-center gap-1">
                        <button
                          onClick={async () => {
                            await updateActiveVersionState();
                            await refreshModelUrlFromDB();
                            setActiveVersion(v);
                          }}
                          className={`px-3 py-1 rounded-md text-sm font-medium transition
                            ${
                              v === activeVersion
                                ? 'bg-[#4ADE80] text-white shadow'
                                : 'bg-white text-gray-700 hover:bg-green-50 hover:text-[#4ADE80]'
                            }`}
                        >
                          {v}
                        </button>
                        <button
                          onClick={() => deleteVersion(v)}
                          className="text-red-400 hover:text-red-600 text-sm"
                          title="Delete version"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  <button
                    onClick={handleAddVersion}
                    disabled={Object.keys(versions).length >= 5}
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold shadow-md transition
                      ${
                        Object.keys(versions).length >= 5
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-[#4ADE80] text-white hover:bg-[#3fd270]'
                      }`}
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* --- Right Panel --- */}
          <div className="w-full md:w-80 bg-white p-6 shadow-xl border-l border-gray-200 rounded-l-3xl">
            {modelUrl && meshParts.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Part</label>
                <select
                  className="w-full border px-2 py-2 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-[#4ADE80]"
                  value={selectedMesh ? selectedMesh.name : ''}
                  onChange={(e) => {
                    const part = meshParts.find(m => m.name === e.target.value);
                    if (part && scene) {
                      const mesh = window.threeScene?.getObjectByName(part.name) || scene.getObjectByName(part.name);
                      if (mesh) setSelectedMesh(mesh);
                      setSelectedName(mesh?.name || '');
                    }
                  }}
                >
                  <option value="" disabled>Select a part...</option>
                  {meshParts.map((part) => (
                    <option key={part.uuid} value={part.name}>{part.name}</option>
                  ))}
                </select>
              </div>
            )}

            {modelUrl && selectedMesh ? (
              <>
                <h2 className="font-semibold text-lg mb-3">{selectedName}</h2>

                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Color</p>
                  <div className="flex flex-wrap gap-2">
                    {['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#6b7280', '#ffffff', '#000000'].map((color) => (
                      <div
                        key={color}
                        className="w-6 h-6 rounded-full cursor-pointer border border-gray-300 hover:scale-110 transition-transform"
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
                        className="h-10 rounded shadow-inner hover:scale-105 transition-transform"
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
                          className="w-10 h-10 rounded border cursor-pointer hover:scale-110 transition-transform"
                          onClick={async () => {
                            if (!selectedMesh) return;
                            await pushUndo(selectedMesh, 'custom');
                            const texture = ((url) => {
                              const tex = loadTex(url);
                              tex.encoding = THREE.sRGBEncoding;
                              tex.flipY = false;
                              return tex;
                            })(tex);
                            selectedMesh.material.map = texture;
                            selectedMesh.material.needsUpdate = true;
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <label
                    htmlFor="texture-upload"
                    className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-4 cursor-pointer hover:border-[#4ADE80] hover:text-[#4ADE80] transition"
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


function Model({
  url,
  selectedMesh,
  setSelectedMesh,
  setSelectedName,
  setScene,
  setMeshParts,
  mode,
  activeVersion,
  versionData
}) {
  const { scene: gltfScene } = useGLTF(url);
  const [clonedScene, setClonedScene] = useState(null);
  const ref = useRef();
  const { gl, camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  // 1️⃣ Scene cloning first (create and render clonedScene)
  useEffect(() => {
    if (!gltfScene) return;

    // clone deeply to avoid mutating the original gltf scene
    const cloned = gltfScene.clone(true);

    // ensure materials are cloned so each mesh has its own material instance
    const meshList = [];
    let idx = 0;
    cloned.traverse((obj) => {
      if (obj.isMesh) {
        if (!obj.name || obj.name === '') obj.name = `part_${idx++}`;
        if (obj.material && obj.material.clone) {
          try {
            obj.material = obj.material.clone();
            obj.material.needsUpdate = true;
          } catch (e) {
            // fallback: create a basic MeshStandardMaterial preserving color/map
            obj.material = new THREE.MeshStandardMaterial({
              color: obj.material?.color ? obj.material.color.clone() : new THREE.Color(0xffffff),
              map: obj.material?.map || null,
              metalness: obj.material?.metalness ?? 0.5,
              roughness: obj.material?.roughness ?? 0.5,
            });
          }
        }
        meshList.push({ name: obj.name, uuid: obj.uuid });
      }
    });

    setMeshParts(meshList);
    setClonedScene(cloned);
    setScene(cloned); // keep parent in sync
    window.threeScene = cloned;
  }, [gltfScene, setScene, setMeshParts]);

  // 2️⃣ Apply version-specific materials AFTER clone is ready
  useEffect(() => {
    if (!clonedScene || !versionData?.materials) return;

    clonedScene.traverse((child) => {
      if (child.isMesh) {
        const m = versionData.materials.find((mat) => mat.name === child.name);
        if (m) {
          try {
            child.material.color = new THREE.Color(m.color);
            if (m.textureDataURL) {
              const tex = ((url) => {
              const tex = loadTex(url);
              tex.encoding = THREE.sRGBEncoding;
              tex.flipY = false;
              return tex;
            })(m.textureDataURL);
              child.material.map = tex;
            } else {
              child.material.map = null;
            }
            child.material.needsUpdate = true;
          } catch (e) {
            console.warn('apply version material error for', child.name, e);
          }
        }
      }
    });
  }, [clonedScene, versionData]);
  // ✅ NEW — Enable clicking directly on meshes in selection mode
  useEffect(() => {
    if (!gl || !gl.domElement) return;
    const canvas = gl.domElement;

    const handlePointerDown = (event) => {
      if (mode !== 'select' || !clonedScene) return;

      const rect = canvas.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, camera);
      const intersects = raycaster.current.intersectObjects(clonedScene.children, true);

      if (intersects.length > 0) {
        const clicked = intersects[0].object;
        setSelectedMesh(clicked);
        setSelectedName(clicked.name || 'Unnamed Part');
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    return () => canvas.removeEventListener('pointerdown', handlePointerDown);
  }, [gl, camera, clonedScene, mode, setSelectedMesh, setSelectedName]);


  // Highlight selected mesh in clonedScene
  useEffect(() => {
    if (!clonedScene) return;
    clonedScene.traverse((child) => {
      if (child.isMesh && child.material) {
        if (child === selectedMesh) {
          if (!child.material.emissive) child.material.emissive = new THREE.Color(0x3b82f6);
          else child.material.emissive.setHex(0x3b82f6);
          child.material.emissiveIntensity = 0.3;
        } else if (child.material.emissive) {
          child.material.emissive.setHex(0x000000);
          child.material.emissiveIntensity = 0;
        }
      }
    });
  }, [clonedScene, selectedMesh]);


  // Reset selection when mode = view
  useEffect(() => {
    if (mode === 'view') {
      setSelectedMesh(null);
      setSelectedName(null);
    }
  }, [mode]);

  // Cursor feedback
  useFrame(() => {
    if (gl && gl.domElement) {
      gl.domElement.style.cursor = mode === 'select' ? 'pointer' : 'grab';
    }
  });

  // Render clonedScene if available; fall back to gltfScene (very temporary)
  return <primitive object={clonedScene || gltfScene} ref={ref} dispose={null} />;
}
