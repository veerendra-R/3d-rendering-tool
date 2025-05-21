import CanvasViewer from '../components/CanvasViewer';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 flex flex-col overflow-hidden">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 bg-gray-100 px-4 py-6 border-b border-gray-300">
        <h1 className="text-3xl font-bold text-gray-800 mb-1">3D Model Editor</h1>
        <p className="text-gray-600 mb-0">Upload, view and customize your 3D models</p>
      </div>

      {/* 3D Viewer */}
      <CanvasViewer />
    </main>
  );
}
