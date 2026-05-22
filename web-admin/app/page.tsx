'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const MapWithNoSSR = dynamic(() => import('./components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] flex items-center justify-center bg-slate-100 rounded-xl border animate-pulse">
      <p className="text-slate-500 font-medium">Chargement de la carte de contrôle Droply...</p>
    </div>
  ),
});

export default function Home() {
  // ⚡ MODIFICATION : On commence sans ID fixé, on attrapera celui qui se connecte !
  const [activeUser, setActiveUser] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<string>("En attente d'un signal livreur...");
  const [isOnline, setIsOnline] = useState<boolean>(false);
  
  const [missions, setMissions] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('15.00');
  const [loadingGeocode, setLoadingGeocode] = useState(false);

  const [pickupInput, setPickupInput] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupSuggestions, setPickupSuggestions] = useState<any[]>([]);

  const [deliveryInput, setDeliveryInput] = useState('');
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [deliverySuggestions, setDeliverySuggestions] = useState<any[]>([]);

  // Charge l'historique de l'utilisateur actif
  const loadLastKnownLocation = (id: string) => {
    fetch(`http://localhost:3000/locations/last/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.createdAt) {
          const date = new Date(data.createdAt);
          setLastSeen(`Hors-ligne (Vu à ${date.toLocaleTimeString()})`);
        } else {
          setLastSeen("Hors-ligne (Aucun point trouvé)");
        }
      })
      .catch(() => setLastSeen("Hors-ligne (Erreur serveur)"));
  };

  // Charge les missions de l'utilisateur actif
  const loadUserMissions = (id: string) => {
    fetch(`http://localhost:3000/missions/user/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setMissions(data);
      })
      .catch((err) => console.error("Erreur missions:", err));
  };

  // ⚡ Déclencher les chargements de BDD dès qu'un utilisateur est détecté
  useEffect(() => {
    if (activeUser) {
      loadUserMissions(activeUser);
    }
  }, [activeUser]);

  useEffect(() => {
    const { io } = require('socket.io-client');
    const socket = io('http://localhost:3000');

    // Écoute les mouvements GPS de TOUT LE MONDE
    socket.on('admin_location_moved', (data: { userId: string; timestamp: string }) => {
      // Magie : On s'aligne automatiquement sur le livreur qui parle !
      setActiveUser(data.userId);
      setIsOnline(true);
      const date = new Date(data.timestamp);
      setLastSeen(`En ligne (Mis à jour à ${date.toLocaleTimeString()})`);
    });

    socket.on('admin_user_offline', (data: { userId: string }) => {
      if (data.userId === activeUser) {
        setIsOnline(false);
        loadLastKnownLocation(data.userId);
      }
    });

    socket.on('admin_mission_updated', (updatedMission: any) => {
      if (updatedMission.status === 'DELETED') {
        setMissions((prevMissions) => prevMissions.filter((m) => m.id !== updatedMission.id));
      } else {
        setMissions((prevMissions) =>
          prevMissions.map((m) => (m.id === updatedMission.id ? updatedMission : m))
        );
      }
    });

    return () => socket.disconnect();
  }, [activeUser]);

  const fetchSuggestions = async (text: string, setSuggestions: (data: any[]) => void) => {
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=5&countrycodes=fr`);
      const data = await response.json();
      setSuggestions(data);
    } catch (error) {
      console.error("Erreur suggestions:", error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchSuggestions(pickupInput, setPickupSuggestions), 400);
    return () => clearTimeout(timer);
  }, [pickupInput]);

  useEffect(() => {
    const timer = setTimeout(() => fetchSuggestions(deliveryInput, setDeliverySuggestions), 400);
    return () => clearTimeout(timer);
  }, [deliveryInput]);

  const handleSubmitMission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return alert("Donne un titre à la mission !");
    if (!pickupCoords || !deliveryCoords) {
      return alert("Sélectionne obligatoirement une adresse dans la liste !");
    }
    if (!activeUser) {
      return alert("Aucun livreur connecté pour recevoir cette course !");
    }

    setLoadingGeocode(true);

    const response = await fetch('http://localhost:3000/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: `Livraison de ${pickupInput} à ${deliveryInput}.`,
        pickupLatitude: pickupCoords.lat,
        pickupLongitude: pickupCoords.lng,
        deliveryLatitude: deliveryCoords.lat,
        deliveryLongitude: deliveryCoords.lng,
        price: parseFloat(price),
        userId: activeUser, // Assigné dynamiquement au livreur actif !
      }),
    });

    setLoadingGeocode(false);

    if (response.ok) {
      setTitle('');
      setPickupInput('');
      setDeliveryInput('');
      setPickupCoords(null);
      setDeliveryCoords(null);
      loadUserMissions(activeUser);
    }
  };

  const handleDeleteMission = async (id: number) => {
    if (!confirm("Voulez-vous vraiment annuler cette course ?")) return;
    const response = await fetch(`http://localhost:3000/missions/${id}`, { method: 'DELETE' });
    if (response.ok && activeUser) {
      loadUserMissions(activeUser);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Droply Control Center</h1>
            <p className="text-sm text-slate-500 mt-1">Suivi de la flotte d'intervenants en temps réel</p>
          </div>
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-full border text-sm font-semibold transition-all duration-300 ${
            isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
            <span>{isOnline ? 'Flux de données Live' : 'Mode Historique'}</span>
          </div>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="space-y-4 lg:col-span-1">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Intervenant ciblé</h3>
              <p className="text-lg font-bold text-slate-800 mt-1 truncate">
                {activeUser ? activeUser : "En attente d'un livreur..."}
              </p>
              <div className={`mt-2 text-xs font-medium ${isOnline ? 'text-emerald-600' : 'text-slate-500'}`}>
                {lastSeen}
              </div>
            </div>

            {/* Formulaire avec Autocomplete */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-800 border-b pb-2">🚀 Assigner une Mission</h3>
              <form onSubmit={handleSubmitMission} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Nom de la course</label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Livraison Pizza Hot" className="w-full p-2 border rounded-lg text-slate-800 font-medium" />
                </div>
                
                {/* Départ */}
                <div className="relative">
                  <label className="block text-slate-500 font-medium mb-1">📍 Adresse de départ</label>
                  <input type="text" value={pickupInput} onChange={(e) => setPickupInput(e.target.value)} placeholder="Tape l'adresse de départ..." className={`w-full p-2 border rounded-lg text-slate-800 font-medium ${pickupCoords ? 'border-emerald-500 bg-emerald-50/30' : ''}`} />
                  {pickupSuggestions.length > 0 && (
                    <ul className="absolute z-50 left-0 right-0 bg-white border rounded-lg mt-1 max-h-40 overflow-y-auto shadow-xl divide-y">
                      {pickupSuggestions.map((s, idx) => (
                        <li key={idx} onClick={() => {
                          setPickupInput(s.display_name);
                          setPickupCoords({ lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
                          setPickupSuggestions([]);
                        }} className="p-2 hover:bg-slate-100 cursor-pointer text-slate-700 truncate">{s.display_name}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Arrivée */}
                <div className="relative">
                  <label className="block text-slate-500 font-medium mb-1">🏁 Adresse d'arrivée</label>
                  <input type="text" value={deliveryInput} onChange={(e) => setDeliveryInput(e.target.value)} placeholder="Tape l'adresse d'arrivée..." className={`w-full p-2 border rounded-lg text-slate-800 font-medium ${deliveryCoords ? 'border-emerald-500 bg-emerald-50/30' : ''}`} />
                  {deliverySuggestions.length > 0 && (
                    <ul className="absolute z-50 left-0 right-0 bg-white border rounded-lg mt-1 max-h-40 overflow-y-auto shadow-xl divide-y">
                      {deliverySuggestions.map((s, idx) => (
                        <li key={idx} onClick={() => {
                          setDeliveryInput(s.display_name);
                          setDeliveryCoords({ lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
                          setDeliverySuggestions([]);
                        }} className="p-2 hover:bg-slate-100 cursor-pointer text-slate-700 truncate">{s.display_name}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <label className="block text-slate-500 font-medium mb-1">Tarif (€)</label>
                  <input type="text" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full p-2 border rounded-lg text-slate-800 font-bold" />
                </div>

                <button type="submit" disabled={loadingGeocode || !pickupCoords || !deliveryCoords || !activeUser} className="w-full bg-slate-900 text-white font-semibold p-2.5 rounded-lg hover:bg-slate-800 transition disabled:bg-slate-300">
                  {activeUser ? 'Envoyer la mission' : ' attente livreur...'}
                </button>
              </form>
            </div>

            {/* Liste des missions */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm max-h-[250px] overflow-y-auto">
              <h3 className="text-sm font-bold text-slate-800 mb-2">📋 Suivi des Missions</h3>
              {missions.length === 0 ? (
                <p className="text-xs text-slate-400">Aucune mission pour ce livreur.</p>
              ) : (
                <div className="space-y-2">
                  {missions.map((m) => (
                    <div key={m.id} className="p-2 bg-slate-50 rounded-lg border text-xs flex justify-between items-center">
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-semibold text-slate-800 truncate">{m.title}</p>
                        <p className="text-slate-500 font-bold">{m.price} €</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-full font-bold text-[10px] tracking-wide uppercase ${
                          m.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                          m.status === 'ACCEPTED' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 
                          m.status === 'REFUSED' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 
                          'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {m.status === 'PENDING' && '⏳ En attente'}
                          {m.status === 'ACCEPTED' && '🏃 Accepté'}
                          {m.status === 'DELIVERED' && '✅ Livré'}
                          {m.status === 'REFUSED' && '❌ Refusé'}
                        </span>
                        {m.status === 'PENDING' && (
                          <button onClick={() => handleDeleteMission(m.id)} className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg border border-rose-200 transition cursor-pointer" title="Supprimer la course" type="button">
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-3">
            <MapWithNoSSR />
          </div>
        </div>
      </div>
    </main>
  );
}