import React, { useState, useCallback } from 'react';
import { getRotationPrompts, generateRotatedImage } from './services/geminiService';
import { GridCell } from './components/GridCell';
import { UploadIcon, DownloadIcon, ResetIcon, CameraIcon, ObjectIcon } from './components/Icons';

// This is required to use JSZip from CDN
declare const JSZip: any;

interface GeneratedImage {
  src: string;
  prompt: string;
}

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isObjectRotationOnly, setIsObjectRotationOnly] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');

  const resetState = () => {
    setOriginalImage(null);
    setGeneratedImages([]);
    setIsLoading(false);
    setStatus('');
    setError('');
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    resetState();
    setIsLoading(true);
    setStatus('Reading image...');
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Image = (reader.result as string).split(',')[1];
      setOriginalImage(`data:${file.type};base64,${base64Image}`);
      await processImage(base64Image, file.type);
    };
    reader.onerror = () => {
        setError('Failed to read the image file.');
        setIsLoading(false);
        setStatus('');
    };
    reader.readAsDataURL(file);
  };

  const processImage = async (base64Image: string, mimeType: string) => {
    try {
      setStatus('1/4: Analyzing camera angle...');
      const prompts = await getRotationPrompts(base64Image, mimeType, isObjectRotationOnly);

      if (!prompts || prompts.length < 3) {
        throw new Error("Could not determine rotation angles. Please try another image.");
      }

      const newImages: GeneratedImage[] = [];
      for (let i = 0; i < 3; i++) {
        setStatus(` ${i + 2}/4: Generating rotated view ${i + 1} of 3...`);
        const generatedImage = await generateRotatedImage(base64Image, mimeType, prompts[i]);
        newImages.push({ src: generatedImage, prompt: prompts[i] });
        setGeneratedImages([...newImages]);
        if (i < 2) {
           await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      setStatus('Processing complete!');
    } catch (err) {
      console.error(err);
      if (err instanceof Error && (err.message.includes('RESOURCE_EXHAUSTED') || err.message.includes('429'))) {
         setError("Quota exhausted. The free tier for the image model has been used up. Please check your Google AI Studio plan or wait a few hours before trying again.");
      } else {
         setError(err instanceof Error ? err.message : 'An unknown error occurred during processing.');
      }
      setStatus('Failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!originalImage || generatedImages.length < 3) return;

    setStatus('Creating ZIP file...');
    try {
        const zip = new JSZip();
        
        // Add original image
        const originalBlob = await fetch(originalImage).then(r => r.blob());
        zip.file("original.png", originalBlob);

        // Add generated images
        for (let i = 0; i < generatedImages.length; i++) {
            const generatedBlob = await fetch(generatedImages[i].src).then(r => r.blob());
            zip.file(`generated_${i + 1}.png`, generatedBlob);
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = 'rotated-images.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setStatus('Download complete!');
    } catch (err) {
        console.error("Failed to create ZIP", err);
        setError("Failed to create ZIP file.");
        setStatus('Failed');
    }
  };

  const isFinished = !isLoading && generatedImages.length === 3;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-gray-900 font-sans">
      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-6">
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">AI Object Rotator</h1>
          <p className="text-lg text-gray-400 mt-2">Generate new perspectives of any image</p>
        </header>

        <main>
          <div className="grid grid-cols-2 gap-4 sm:gap-6 aspect-square mb-6">
            <GridCell>
              {!originalImage ? (
                 <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center justify-center text-center p-4 w-full h-full bg-gray-800/50 border-2 border-dashed border-gray-600 rounded-lg hover:bg-gray-700/50 transition-colors duration-300">
                    <UploadIcon className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mb-3" />
                    <span className="font-semibold text-white">Upload an Image</span>
                    <span className="text-sm text-gray-400">Tap or click to select a file</span>
                    <input id="file-upload" type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isLoading} />
                 </label>
              ) : (
                <img src={originalImage} alt="Original upload" className="w-full h-full object-contain rounded-lg" />
              )}
            </GridCell>
            {[...Array(3)].map((_, i) => (
              <GridCell key={i} prompt={generatedImages[i]?.prompt}>
                {isLoading && !generatedImages[i] && (
                  <div className="flex items-center justify-center w-full h-full">
                    <svg className="animate-spin h-8 w-8 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
                {generatedImages[i] && (
                  <img src={generatedImages[i].src} alt={`Generated view ${i+1}`} className="w-full h-full object-contain rounded-lg" />
                )}
              </GridCell>
            ))}
          </div>
          
          <div className="bg-gray-800/50 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              {!originalImage ? (
                <div className="flex items-center space-x-3">
                    <input
                        type="checkbox"
                        id="rotate-object-only"
                        checked={isObjectRotationOnly}
                        onChange={(e) => setIsObjectRotationOnly(e.target.checked)}
                        disabled={isLoading}
                        className="h-5 w-5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600 focus:ring-offset-gray-800"
                    />
                    <label htmlFor="rotate-object-only" className="flex items-center text-white font-medium cursor-pointer">
                        {isObjectRotationOnly ? <ObjectIcon className="w-5 h-5 mr-2 text-blue-400" /> : <CameraIcon className="w-5 h-5 mr-2 text-gray-400" />}
                        Rotate Only Object
                    </label>
                </div>
               ) : <div /> /* Placeholder to keep buttons aligned right */}

              <div className="flex items-center gap-3">
                  {isFinished && (
                      <>
                          <button onClick={handleDownloadZip} className="flex items-center justify-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors duration-200 disabled:opacity-50" disabled={isLoading}>
                              <DownloadIcon className="w-5 h-5 mr-2" />
                              Download ZIP
                          </button>
                          <button onClick={resetState} className="flex items-center justify-center px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg transition-colors duration-200 disabled:opacity-50" disabled={isLoading}>
                              <ResetIcon className="w-5 h-5 mr-2" />
                              Reset
                          </button>
                      </>
                  )}
              </div>
          </div>
          
          {(isLoading || status || error) && (
              <div className="mt-4 text-center p-3 rounded-lg bg-gray-800/70">
                  {error ? (
                    <p className="text-red-400 font-semibold">{error}</p>
                  ) : (
                    <p className="text-blue-300">{status}</p>
                  )}
              </div>
          )}
        </main>
        <footer className="text-center py-4 mt-8">
          <p className="text-sm text-gray-500">
            Made by <a href="https://www.mimagie.fr">mimagie</a>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;