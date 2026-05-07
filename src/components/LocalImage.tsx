/**
 * LocalImage Component - React version
 *
 * Handles local file paths and base64 images:
 * - Converts file paths to Tauri-compatible URLs using convertFileSrc
 * - Handles base64 data directly
 * - Shows error fallback when image fails to load
 */
import { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

export interface LocalImageProps {
  src: string;
  alt?: string;
  className?: string;
  onClick?: () => void;
}

export function LocalImage({ src, alt, className, onClick }: LocalImageProps) {
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) {
      setImageUrl('');
      setError(false);
      return;
    }

    // Check if it's a path or base64
    // If it starts with / or X:\, it's a path
    const isPath = src.startsWith('/') || src.match(/^[a-zA-Z]:\\/);

    if (!isPath) {
      // Assume base64
      setImageUrl(`data:image/png;base64,${src}`);
      setError(false);
      return;
    }

    try {
      setImageUrl(convertFileSrc(src));
      setError(false);
    } catch (e) {
      console.error('Failed to load image:', src, e);
      setError(true);
    }

    // Cleanup blob URLs on unmount (if any were created)
    return () => {
      // Note: convertFileSrc doesn't create blob URLs, so no cleanup needed
      // But if we ever use blob URLs elsewhere, we'd revoke them here
    };
  }, [src]);

  if (error || !imageUrl) {
    return (
      <div
        className={`${className || ''} bg-muted/50 flex items-center justify-center text-muted-foreground`}
        onClick={onClick}
      >
        <span className="text-xs">Image Error</span>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      onClick={onClick}
      onError={() => setError(true)}
    />
  );
}

export default LocalImage;