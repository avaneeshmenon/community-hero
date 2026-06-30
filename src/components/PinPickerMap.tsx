import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

// Global memory cache to prevent duplicate Nominatim/reverse-geocode hits
const geocodeCache: Record<string, { locality: string; city: string; localities: string[] }> = {};

interface PinPickerMapProps {
  lat: number | null;
  lng: number | null;
  onCoordinatesChange: (coords: { lat: number; lng: number }) => void;
  onLocalityDetected?: (locality: string, city: string, allLocalities: string[]) => void;
}

export default function PinPickerMap({
  lat,
  lng,
  onCoordinatesChange,
  onLocalityDetected
}: PinPickerMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [mapError, setMapError] = useState<boolean>(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState<boolean>(false);

  // Standard fallback coordinates: Pune city center
  const defaultLat = lat || 18.5204;
  const defaultLng = lng || 73.8567;

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Clean up any residual leaflet ID or existing map container properties to prevent reuse issues
    if ((mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    try {
      // 1. Create Map Instance
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true
      }).setView([defaultLat, defaultLng], 15);

      mapRef.current = map;

      // 2. Add OpenStreetMap Tile Layer
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
      });

      tileLayer.on('tileerror', () => {
        console.warn('Map tiles failed to load in PinPickerMap');
        setMapError(true);
      });

      tileLayer.addTo(map);

      // 3. Add Draggable Marker
      // We use a custom SVG divIcon so we don't depend on broken leaflet default asset paths
      const customIcon = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center w-8 h-8">
            <div class="absolute w-8 h-8 rounded-full bg-indigo-500/30 animate-pulse"></div>
            <div class="w-5 h-5 bg-indigo-600 border-2 border-white rounded-full shadow-lg flex items-center justify-center">
              <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
            </div>
          </div>
        `,
        className: 'pin-picker-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([defaultLat, defaultLng], {
        draggable: true,
        icon: customIcon
      }).addTo(map);

      markerRef.current = marker;

      // 4. Handle marker drag finalized (dragend)
      marker.on('dragend', async () => {
        const position = marker.getLatLng();
        onCoordinatesChange({ lat: position.lat, lng: position.lng });
        await handleReverseGeocode(position.lat, position.lng);
      });

      // Force size update to fix partial loading container issues
      setTimeout(() => {
        map.invalidateSize();
      }, 100);

    } catch (err) {
      console.error('Failed to initialize Leaflet PinPicker map:', err);
      setMapError(true);
    }

    return () => {
      try {
        if (markerRef.current && mapRef.current) {
          markerRef.current.remove();
        }
      } catch (e) {
        console.warn('Error removing marker during cleanup:', e);
      }
      try {
        if (mapRef.current) {
          mapRef.current.remove();
        }
      } catch (e) {
        console.warn('Error removing map during cleanup:', e);
      }
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Sync external coordinate updates (e.g., GPS Re-detect)
  useEffect(() => {
    if (mapRef.current && markerRef.current && lat !== null && lng !== null) {
      const currentPos = markerRef.current.getLatLng();
      const diffLat = Math.abs(currentPos.lat - lat);
      const diffLng = Math.abs(currentPos.lng - lng);
      // Only sync if the coordinates have shifted significantly, to avoid feedback loops or race conditions with dragging
      if (diffLat > 0.00001 || diffLng > 0.00001) {
        const nextPos = L.latLng(lat, lng);
        const timeoutId = setTimeout(() => {
          try {
            if (markerRef.current && mapRef.current) {
              markerRef.current.setLatLng(nextPos);
              mapRef.current.setView(nextPos, mapRef.current.getZoom());
              handleReverseGeocode(lat, lng);
            }
          } catch (e) {
            console.warn('Failed to sync map position safely:', e);
          }
        }, 50);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [lat, lng]);

  // Reverse Geocoding with local cache and debouncing
  const handleReverseGeocode = async (latitude: number, longitude: number) => {
    if (!onLocalityDetected) return;

    // Build unique cache key with 4 decimal digits (~11 meters precision is plenty)
    const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    
    if (geocodeCache[cacheKey]) {
      const cached = geocodeCache[cacheKey];
      onLocalityDetected(cached.locality, cached.city, cached.localities);
      return;
    }

    setIsReverseGeocoding(true);

    try {
      const res = await fetch(`/api/reverse-geocode?lat=${latitude}&lng=${longitude}`, {
        headers: {
          'User-Agent': 'CommunityHeroApp/1.0',
          'Referer': window.location.origin
        }
      });

      if (res.ok) {
        const data = await res.json();
        const detectedLoc = data.locality || '';
        const detectedCity = data.city || 'Pune';
        const detectedLocalities = data.localities || (detectedLoc ? [detectedLoc] : []);

        // Cache result
        geocodeCache[cacheKey] = {
          locality: detectedLoc,
          city: detectedCity,
          localities: detectedLocalities
        };

        onLocalityDetected(detectedLoc, detectedCity, detectedLocalities);
      } else {
        console.warn('Reverse-geocode endpoint returned error:', res.status);
      }
    } catch (err) {
      console.error('Failed to reverse-geocode coordinates:', err);
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  if (mapError) {
    return (
      <div className="flex flex-col items-center justify-center border border-slate-200 bg-slate-50 rounded-xl h-48 p-4 text-center">
        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Map Unavailable</span>
        <p className="text-[11px] text-slate-500 max-w-xs leading-normal">
          We could not load the interactive map picker. You can still input your neighborhood manually.
        </p>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-3xs">
      <div ref={mapContainerRef} className="w-full h-48 z-0" />
      {isReverseGeocoding && (
        <div className="absolute bottom-2 left-2 bg-white/95 border border-slate-100 rounded-lg px-2 py-1 shadow-2xs text-[10px] text-indigo-600 font-bold uppercase tracking-wider flex items-center space-x-1 animate-pulse z-10">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping" />
          <span>Verifying Spot...</span>
        </div>
      )}
      <div className="absolute top-2 right-2 bg-white/90 border border-slate-100 rounded-md px-1.5 py-0.5 text-[8.5px] text-slate-500 font-mono z-10 select-none shadow-3xs pointer-events-none">
        lat: {lat?.toFixed(5) || 'N/A'}, lng: {lng?.toFixed(5) || 'N/A'}
      </div>
    </div>
  );
}
