import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Report, IssueStatus, IssueSeverity } from '../types';
import { MapPin, Layers, X, ShieldAlert, SlidersHorizontal, ArrowLeft } from 'lucide-react';

interface InteractiveMapProps {
  reports: Report[];
  selectedLocality: string;
  selectedCategory: string;
  selectedSeverity: string;
  searchQuery: string;
  userCoords: { lat: number; lng: number } | null;
  onSelectReport: (id: string) => void;
  onClose?: () => void;
}

// Known coordinates for standard default local areas in Pune
const LOCALITY_COORDS_MAP: { [key: string]: { lat: number; lng: number } } = {
  'bavdhan': { lat: 18.5080, lng: 73.7845 },
  'kothrud': { lat: 18.5074, lng: 73.8077 },
  'pashan': { lat: 18.5372, lng: 73.7934 },
  'baner': { lat: 18.5590, lng: 73.7787 },
  'aundh': { lat: 18.5580, lng: 73.8075 },
  'wakad': { lat: 18.5987, lng: 73.7689 }
};

export default function InteractiveMap({
  reports,
  selectedLocality,
  selectedCategory,
  selectedSeverity,
  searchQuery,
  userCoords,
  onSelectReport,
  onClose
}: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<any>(null);
  const [mapError, setMapError] = useState(false);

  // Helper to find a locality's representative coordinates
  const getLocalityCoordinates = (loc: string): { lat: number; lng: number } | null => {
    const lower = loc.toLowerCase().trim();
    if (LOCALITY_COORDS_MAP[lower]) {
      return LOCALITY_COORDS_MAP[lower];
    }
    const matchingRep = reports.find(
      r => r.locality && r.locality.toLowerCase().trim() === lower && typeof r.lat === 'number' && typeof r.lng === 'number'
    );
    if (matchingRep && matchingRep.lat && matchingRep.lng) {
      return { lat: matchingRep.lat, lng: matchingRep.lng };
    }
    return null;
  };

  // Helper to create beautiful status/severity divIcons
  const getMarkerIcon = (status: IssueStatus, severity: IssueSeverity) => {
    let bgColor = 'bg-slate-500'; // Default Reported
    if (status === 'Verified') bgColor = 'bg-blue-500';
    else if (status === 'In Progress') bgColor = 'bg-amber-500';
    else if (status === 'Resolved') bgColor = 'bg-emerald-500';
    else if (status === 'Reported') bgColor = 'bg-slate-500';

    let ringStyle = '';
    let sizeClass = 'w-5 h-5';
    let dotSize = 'w-2 h-2';

    if (severity === 'High') {
      ringStyle = 'ring-4 ring-rose-500/40 animate-pulse';
      sizeClass = 'w-7 h-7';
      dotSize = 'w-3 h-3';
    } else if (severity === 'Medium') {
      ringStyle = 'ring-2 ring-indigo-500/20';
    }

    const html = `
      <div class="relative flex items-center justify-center ${sizeClass}">
        ${severity === 'High' ? `<span class="absolute inline-flex w-full h-full rounded-full ${bgColor} opacity-60 animate-ping"></span>` : ''}
        <div class="relative flex items-center justify-center rounded-full ${bgColor} ${ringStyle} ${sizeClass} border-2 border-white shadow-md transition-all">
          <div class="rounded-full ${dotSize} bg-white"></div>
        </div>
      </div>
    `;

    return L.divIcon({
      html,
      className: 'custom-map-marker',
      iconSize: severity === 'High' ? [28, 28] : [20, 20],
      iconAnchor: severity === 'High' ? [14, 14] : [10, 10],
      popupAnchor: [0, -10]
    });
  };

  // Filter reports strictly according to the active filters
  const filteredMapReports = reports.filter(report => {
    if (typeof report.lat !== 'number' || typeof report.lng !== 'number' || report.lat === null || report.lng === null) {
      return false;
    }

    const matchLocality = selectedLocality === 'All' || selectedLocality === 'All areas' || selectedLocality === 'All Areas' || 
      (report.locality && report.locality.toLowerCase().trim() === selectedLocality.toLowerCase().trim());
    
    const matchCat = selectedCategory === 'All' || report.department === selectedCategory;
    const matchSev = selectedSeverity === 'All' || report.severity === selectedSeverity;

    const term = searchQuery.toLowerCase().trim();
    const matchSearch = term === '' || 
      report.title.toLowerCase().includes(term) || 
      report.description.toLowerCase().includes(term) || 
      report.locationText.toLowerCase().includes(term);

    return matchLocality && matchCat && matchSev && matchSearch;
  });

  // Calculate Initial Map Center/Zoom
  const getInitialCenter = (): { center: [number, number]; zoom: number } => {
    // 1. If user geolocation is available, center there
    if (userCoords && typeof userCoords.lat === 'number' && typeof userCoords.lng === 'number') {
      return { center: [userCoords.lat, userCoords.lng], zoom: 14 };
    }

    // 2. Otherwise, center on the average of filtered/available report coordinates
    const validCoords = reports.filter(r => typeof r.lat === 'number' && typeof r.lng === 'number' && r.lat !== null && r.lng !== null);
    if (validCoords.length > 0) {
      const avgLat = validCoords.reduce((acc, r) => acc + (r.lat || 0), 0) / validCoords.length;
      const avgLng = validCoords.reduce((acc, r) => acc + (r.lng || 0), 0) / validCoords.length;
      return { center: [avgLat, avgLng], zoom: 13 };
    }

    // 3. Fallback to default city center
    return { center: [18.5204, 73.8567], zoom: 12 };
  };

  // Initialize Map Instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Clean up any residual leaflet ID or existing map container properties to prevent reuse issues
    if ((mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    try {
      const { center, zoom } = getInitialCenter();

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true
      }).setView(center, zoom);

      mapRef.current = map;

      // Add OSM standard tile layer
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
      });

      tileLayer.on('tileerror', () => {
        console.warn('Interactive map tile loading failed');
        setMapError(true);
      });

      tileLayer.addTo(map);

      // Create and attach custom styled marker cluster group
      clusterGroupRef.current = (L as any).markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 40,
        iconCreateFunction: function(cluster: any) {
          const childCount = cluster.getChildCount();
          let colorStyle = 'bg-indigo-600/95 ring-4 ring-indigo-500/25 text-white';
          if (childCount < 8) {
            colorStyle = 'bg-teal-600/95 ring-4 ring-teal-500/25 text-white';
          } else if (childCount < 25) {
            colorStyle = 'bg-amber-600/95 ring-4 ring-amber-500/25 text-white';
          }
          return new L.DivIcon({
            html: `<div class="flex items-center justify-center rounded-full w-9 h-9 font-bold text-xs shadow-md ${colorStyle}"><span>${childCount}</span></div>`,
            className: 'custom-cluster-icon',
            iconSize: new L.Point(36, 36)
          });
        }
      });

      map.addLayer(clusterGroupRef.current);

      // Lazy load image inside popup when it opens
      map.on('popupopen', async (e: any) => {
        const popup = e.popup;
        const container = popup.getElement();
        if (!container) return;

        const imgContainer = container.querySelector('.map-popup-image-container');
        if (!imgContainer) return;

        const reportId = imgContainer.getAttribute('data-report-id');
        if (!reportId) return;

        const imgElement = imgContainer.querySelector('.map-popup-image') as HTMLImageElement;
        const loadingElement = imgContainer.querySelector('.map-popup-loading') as HTMLDivElement;

        // Skip if already loaded
        if (imgElement && imgElement.src) {
          imgElement.classList.remove('hidden');
          if (loadingElement) loadingElement.classList.add('hidden');
          return;
        }

        const report = reports.find(r => r.id === reportId);
        if (!report) return;

        try {
          let imageData: string | null = null;
          
          if (report.hasImage) {
            const imagesColl = collection(db, 'reports', report.id, 'images');
            const q = query(imagesColl, orderBy('order', 'asc'));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
              imageData = snapshot.docs[0].data().data || null;
            } else {
              const docRef = doc(db, 'reportImages', report.id);
              const snap = await getDoc(docRef);
              if (snap.exists()) {
                imageData = snap.data().imageData || null;
              }
            }
          } else if (report.photoUrl && report.photoUrl !== 'placeholder') {
            imageData = report.photoUrl;
          }

          if (imageData) {
            if (imgElement) {
              imgElement.src = imageData;
              imgElement.classList.remove('hidden');
            }
            if (loadingElement) {
              loadingElement.classList.add('hidden');
            }
          } else {
            if (loadingElement) {
              loadingElement.innerHTML = '<span class="text-slate-400">No Image proof</span>';
              loadingElement.classList.remove('animate-pulse');
            }
          }
        } catch (err) {
          console.warn('Failed loading image for map popup:', err);
          if (loadingElement) {
            loadingElement.innerHTML = '<span class="text-rose-500">Image failed</span>';
            loadingElement.classList.remove('animate-pulse');
          }
        }
      });

      // Refresh layout context quickly
      setTimeout(() => {
        map.invalidateSize();
      }, 150);

    } catch (err) {
      console.error('Failed to initialize interactive map:', err);
      setMapError(true);
    }

    return () => {
      try {
        if (clusterGroupRef.current && mapRef.current) {
          mapRef.current.removeLayer(clusterGroupRef.current);
        }
      } catch (e) {
        console.warn('Error removing cluster group layer:', e);
      }
      try {
        if (mapRef.current) {
          mapRef.current.remove();
        }
      } catch (e) {
        console.warn('Error removing map during cleanup:', e);
      }
      mapRef.current = null;
      clusterGroupRef.current = null;
    };
  }, []);

  // Update map view on locality filter selection
  useEffect(() => {
    if (!mapRef.current) return;
    if (selectedLocality && selectedLocality !== 'All' && selectedLocality !== 'All areas' && selectedLocality !== 'All Areas') {
      const coords = getLocalityCoordinates(selectedLocality);
      if (coords) {
        mapRef.current.flyTo([coords.lat, coords.lng], 14, {
          animate: true,
          duration: 1.2
        });
      }
    }
  }, [selectedLocality]);

  // Synchronize dynamic report markers on filter change
  useEffect(() => {
    const map = mapRef.current;
    const clusterGroup = clusterGroupRef.current;
    if (!map || !clusterGroup) return;

    // Clear old markers
    clusterGroup.clearLayers();

    // Plot markers
    filteredMapReports.forEach(report => {
      if (report.lat === null || report.lng === null) return;

      const marker = L.marker([report.lat, report.lng], {
        icon: getMarkerIcon(report.status, report.severity)
      });

      // Build popup DOM dynamically to bind reactive trigger click action cleanly
      const popupContainer = document.createElement('div');
      popupContainer.className = 'w-52 font-sans p-1 text-xs select-text';

      const hasImage = report.hasImage || (report.photoUrl && report.photoUrl !== 'placeholder');
      const imageHtml = hasImage
        ? `<div class="map-popup-image-container mb-2" data-report-id="${report.id}">
             <img class="map-popup-image hidden w-full h-24 object-cover rounded-lg border border-slate-100" referrerPolicy="no-referrer" alt="${report.title}" />
             <div class="map-popup-loading w-full h-24 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-[9px] font-mono animate-pulse">
               <span class="animate-bounce">Loading Image proof...</span>
             </div>
           </div>`
        : `<div class="w-full h-16 bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 text-[9px] mb-2 font-mono">No Image proof</div>`;

      let statusStyle = 'bg-slate-100 text-slate-700';
      if (report.status === 'Verified') statusStyle = 'bg-blue-50 text-blue-700 border border-blue-100 font-bold';
      else if (report.status === 'In Progress') statusStyle = 'bg-amber-50 text-amber-700 border border-amber-100 font-bold';
      else if (report.status === 'Resolved') statusStyle = 'bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold';

      let severityStyle = 'bg-slate-100 text-slate-700';
      if (report.severity === 'High') severityStyle = 'bg-rose-50 text-rose-700 border border-rose-100 font-black animate-pulse';
      else if (report.severity === 'Medium') severityStyle = 'bg-amber-50 text-amber-700 border border-amber-100 font-semibold';
      else if (report.severity === 'Low') severityStyle = 'bg-teal-50 text-teal-700 border border-teal-100 font-medium';

      popupContainer.innerHTML = `
        ${imageHtml}
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-1 flex-wrap">
            <span class="px-1.5 py-0.5 rounded-full text-[8.5px] uppercase tracking-wider ${statusStyle}">${report.status}</span>
            <span class="px-1.5 py-0.5 rounded-full text-[8.5px] uppercase tracking-wider ${severityStyle}">${report.severity}</span>
          </div>
          <div class="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">${report.department} • ${report.subcategory}</div>
          <h4 class="font-bold text-slate-800 leading-tight line-clamp-2 text-xs">${report.title}</h4>
          <div class="flex items-center justify-between text-[10px] font-mono text-indigo-600 font-semibold pt-0.5">
            <span>${report.verificationCount || 0} Votes</span>
            <span class="text-slate-400 font-normal truncate max-w-[100px]">${report.locality || 'Unknown'}</span>
          </div>
          <button class="view-detail-action w-full mt-2 inline-flex items-center justify-center px-2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10.5px] font-bold tracking-tight cursor-pointer transition-colors shadow-2xs">
            View report
          </button>
        </div>
      `;

      // Attach detailed click navigation handler
      const button = popupContainer.querySelector('.view-detail-action');
      if (button) {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          onSelectReport(report.id);
        });
      }

      marker.bindPopup(popupContainer, {
        maxWidth: 240,
        closeButton: true
      });

      clusterGroup.addLayer(marker);
    });

  }, [filteredMapReports]);

  if (mapError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center h-[50vh] shadow-3xs">
        <ShieldAlert className="h-9 w-9 text-rose-500 animate-bounce mb-3" />
        <h3 className="font-sans text-sm font-black text-slate-900 uppercase tracking-wider">Map Unavailable</h3>
        <p className="mt-2 max-w-sm font-sans text-xs text-slate-550 leading-relaxed">
          OpenStreetMap or map tiles failed to load. Please verify your internet connection or reload.
        </p>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-5 inline-flex items-center space-x-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-full cursor-pointer shadow-md active:scale-95 transition-all"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Go Back to Feed</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-[65vh] md:h-[75vh] rounded-2xl overflow-hidden border border-slate-150 shadow-xs bg-slate-100 flex flex-col">
      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
        
        {/* Filter Summary Pill */}
        <div className="pointer-events-auto ml-11 flex items-center space-x-1.5 bg-white/95 border border-slate-150 px-3 py-2 rounded-full shadow-md text-[10px] font-sans font-bold text-slate-700">
          <MapPin className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
          <span className="truncate max-w-[150px] md:max-w-none">
            {selectedLocality === 'All' ? 'All Areas' : selectedLocality} • {selectedCategory === 'All' ? 'All Categories' : selectedCategory}
          </span>
          <span className="inline-flex h-4 px-1.5 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 text-[9px]">
            {filteredMapReports.length} pins
          </span>
        </div>

        {/* Close Button / Switch to Feed Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="pointer-events-auto flex items-center space-x-1 px-3 py-2 bg-slate-900/90 hover:bg-slate-900 text-white font-sans text-[10.5px] font-extrabold uppercase tracking-widest rounded-full shadow-md cursor-pointer transition-all active:scale-95 shrink-0"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Feed view</span>
          </button>
        )}
      </div>

      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />
      
      {/* Dynamic Map Legend in Bottom Left */}
      <div className="absolute bottom-4 left-4 z-10 bg-white/95 border border-slate-150 px-3 py-2.5 rounded-xl shadow-md text-[9.5px] font-sans font-semibold text-slate-650 flex flex-col gap-1.5">
        <span className="font-bold text-[8.5px] text-slate-400 uppercase tracking-wider mb-0.5">Status Color Guide</span>
        <div className="flex items-center space-x-2">
          <span className="h-2 w-2 rounded-full bg-slate-500" />
          <span>Reported (unverified)</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          <span>Verified (high-priority)</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span>In Progress (scheduled)</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Resolved (completed)</span>
        </div>
        <div className="flex items-center space-x-2 border-t border-slate-100 pt-1.5 mt-0.5">
          <span className="h-2 w-2 rounded-full bg-rose-500 ring-2 ring-rose-500/30 animate-pulse" />
          <span className="font-bold text-rose-700">High Severity Priority</span>
        </div>
      </div>
    </div>
  );
}
