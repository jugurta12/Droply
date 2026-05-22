'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { io } from 'socket.io-client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Petit fix nécessaire pour afficher correctement les icônes Leaflet avec Next.js
const customIcon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Composant pour recentrer la carte quand la position bouge
function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

export default function Map() {
  const [position, setPosition] = useState<[number, number]>([48.8566, 2.3522]); // Position par défaut (Paris)
  const [intervenantId, setIntervenantId] = useState<string | null>(null);

  useEffect(() => {
    // Connexion au Backend NestJS
    const socket = io('http://localhost:3000');

    socket.on('connect', () => {
      console.log('🖥️ Dashboard Admin connecté au WebSocket !');
    });

    // Écoute de l'événement envoyé par la GpsGateway de NestJS
    socket.on('admin_location_moved', (data: { userId: string; latitude: number; longitude: number }) => {
      console.log('📍 Position reçue sur le Dashboard :', data);
      setPosition([data.latitude, data.longitude]);
      setIntervenantId(data.userId);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="w-full h-[600px] rounded-xl overflow-hidden shadow-lg border border-slate-200">
      <MapContainer center={position} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position} icon={customIcon}>
          <Popup>
            <span className="font-semibold text-slate-800">
              {intervenantId ? `Intervenant : ${intervenantId}` : "En attente de signal..."}
            </span>
          </Popup>
        </Marker>
        <RecenterMap center={position} />
      </MapContainer>
    </div>
  );
}