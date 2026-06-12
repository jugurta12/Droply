'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const MapWithNoSSR = dynamic(() => import('./components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[650px] flex flex-col items-center justify-center bg-slate-50 rounded-2xl border border-slate-200/60 shadow-sm animate-pulse">
      <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-slate-500 font-medium text-sm tracking-tight">Initialisation de la matrice de contrôle...</p>
    </div>
  ),
});

export default function Home() {
  // ⚡ ÉTATS D'AUTHENTIFICATION WEB
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // ⚡ NAVIGATION : 'DASHBOARD' pour l'accueil cartographique, 'CONTROL_CENTER' pour la gestion des utilisateurs
  const [currentView, setCurrentView] = useState<'DASHBOARD' | 'CONTROL_CENTER'>('DASHBOARD');

  // ⚡ ETATS COMPTES ET SUCKETS MULTI-LIVREURS
  const [allDbUsers, setAllDbUsers] = useState<any[]>([]); // Tous les utilisateurs (Admin, Client, Livreur)
  const [connectedDrivers, setConnectedDrivers] = useState<any[]>([]); // Uniquement les livreurs connectés au Socket

  // États du Dashboard
  const [activeUser, setActiveUser] = useState<string | null>(null);
  const [selectedMissionRecipients, setSelectedMissionRecipients] = useState<string[]>([]);
  const [lastSeen, setLastSeen] = useState<string>("En attente d'un signal livreur...");
  const [isOnline, setIsOnline] = useState<boolean>(false);
  
  const [missions, setMissions] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('15.00');
  const [loadingGeocode, setLoadingGeocode] = useState(false);

  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');

  const [pickupInput, setPickupInput] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupSuggestions, setPickupSuggestions] = useState<any[]>([]);

  const [deliveryInput, setDeliveryInput] = useState('');
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [deliverySuggestions, setDeliverySuggestions] = useState<any[]>([]);

  const [isPickupSelected, setIsPickupSelected] = useState(false);
  const [isDeliverySelected, setIsDeliverySelected] = useState(false);

  // ⚡ PERSISTANCE SESSION WEB : Vérifie si l'admin était déjà connecté
  useEffect(() => {
    const savedAuth = localStorage.getItem('droply_admin_auth');
    if (savedAuth === 'true') {
      setIsAdminAuthenticated(true);
    }
  }, []);

  // ⚡ RECUPERATION TOUS LES UTILISATEURS DU CENTRE DE CONTROLE
  const loadAllDatabaseUsers = async () => {
    try {
      const res = await fetch('http://localhost:3000/auth/users');
      const data = await res.json();
      if (Array.isArray(data)) {
        setAllDbUsers(data);
      }
    } catch (err) {
      console.error("Erreur récupération comptes :", err);
    }
  };

  useEffect(() => {
    if (isAdminAuthenticated) {
      loadAllDatabaseUsers();
    }
  }, [isAdminAuthenticated, currentView]);

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

  const loadUserMissions = (id: string) => {
    fetch(`http://localhost:3000/missions/user/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setMissions(data);
      })
      .catch((err) => console.error("Erreur missions:", err));
  };

  useEffect(() => {
    if (isAdminAuthenticated && activeUser) {
      loadUserMissions(activeUser);
    }
  }, [activeUser, isAdminAuthenticated]);

  useEffect(() => {
    if (!isAdminAuthenticated) return;

    const { io } = require('socket.io-client');
    const socket = io('http://localhost:3000');

    socket.on('admin_location_moved', (data: { userId: string; timestamp: string }) => {
      // Extraction des métadonnées pour le menu déroulant dynamique des livreurs connectés
      setConnectedDrivers(prev => {
        if (prev.some(d => d.socketId === data.userId)) return prev;
        
        // On essaye de reconstruire proprement un affichage lisible à partir du pattern "intervenant_nom_id"
        const parts = data.userId.split('_');
        const displayLabel = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : data.userId;
        return [...prev, { socketId: data.userId, label: displayLabel }];
      });

      if (!activeUser) {
        setActiveUser(data.userId);
      }

      if (data.userId === activeUser) {
        setIsOnline(true);
        const date = new Date(data.timestamp);
        setLastSeen(`En ligne (Mis à jour à ${date.toLocaleTimeString()})`);
      }
    });

    socket.on('admin_user_offline', (data: { userId: string }) => {
      setConnectedDrivers(prev => prev.filter(d => d.socketId !== data.userId));
      
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
  }, [activeUser, isAdminAuthenticated]);

  // ⚡ DISPATCHER DE SÉLECTION DANS LE MENU DÉROULANT DE L'ACCUEIL
  const handleSelectConnectedDriver = (socketId: string) => {
    setActiveUser(socketId);
    setSelectedMissionRecipients(prev => prev.includes(socketId) ? prev : [...prev, socketId]);
    setIsOnline(true);
    setLastSeen("En ligne (Flux actif)");
    loadUserMissions(socketId);
  };

  const handleToggleMissionRecipient = (socketId: string) => {
    setSelectedMissionRecipients(prev =>
      prev.includes(socketId)
        ? prev.filter(id => id !== socketId)
        : [...prev, socketId]
    );
  };

  const handleSelectAllMissionRecipients = () => {
    setSelectedMissionRecipients(missionRecipientOptions.map(driver => driver.socketId));
  };

  const handleClearMissionRecipients = () => {
    setSelectedMissionRecipients([]);
  };

  // ⚡ MANAGEMENT CRUD : UPDATE RÔLE DANS LE CENTRE DE CONTRÔLE
  const handleChangeRoleInControlCenter = async (userId: number, nextRole: string) => {
    try {
      const response = await fetch(`http://localhost:3000/auth/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (response.ok) {
        loadAllDatabaseUsers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ⚡ MANAGEMENT CRUD : BAN / SUPPRESSION DANS LE CENTRE DE CONTRÔLE
  const handleDeleteUserInControlCenter = async (userId: number, firstName: string) => {
    if (!confirm(`Confirmer la suppression définitive du compte de ${firstName} ?`)) return;
    try {
      const response = await fetch(`http://localhost:3000/auth/users/${userId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        loadAllDatabaseUsers();
      }
    } catch (err) {
      console.error(err);
    }
  };

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
    if (!isAdminAuthenticated) return;
    if (isPickupSelected) {
      setIsPickupSelected(false);
      return;
    }
    const timer = setTimeout(() => fetchSuggestions(pickupInput, setPickupSuggestions), 400);
    return () => clearTimeout(timer);
  }, [pickupInput, isPickupSelected, isAdminAuthenticated]);

  useEffect(() => {
    if (!isAdminAuthenticated) return;
    if (isDeliverySelected) {
      setIsDeliverySelected(false);
      return;
    }
    const timer = setTimeout(() => fetchSuggestions(deliveryInput, setDeliverySuggestions), 400);
    return () => clearTimeout(timer);
  }, [deliveryInput, isDeliverySelected, isAdminAuthenticated]);

  // ⚡ SOUCHET AUTHENTIFICATION WEB + FILTRAGE RÔLE
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) return setAuthError("Veuillez remplir tous les champs.");
    
    setAuthError(null);
    setAuthLoading(true);

    try {
      const response = await fetch('http://localhost:3000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await response.json();

      setAuthLoading(false);

      if (data.error) {
        return setAuthError(data.error);
      }

      if (data.success && data.user) {
        if (data.user.role === 'ADMIN') {
          setIsAdminAuthenticated(true);
          localStorage.setItem('droply_admin_auth', 'true');
        } else {
          setAuthError("Accès refusé. Cette console est strictement réservée aux administrateurs.");
        }
      }
    } catch (err) {
      setAuthLoading(false);
      setAuthError("Erreur de connexion au serveur d'authentification.");
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    localStorage.removeItem('droply_admin_auth');
    setActiveUser(null);
    setMissions([]);
    setLoginEmail('');
    setLoginPassword('');
    setCurrentView('DASHBOARD');
  };

  const handleSubmitMission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return alert("Donne un titre à la mission !");
    if (!pickupCoords || !deliveryCoords) {
      return alert("Sélectionne obligatoirement une adresse dans la liste !");
    }
    if (selectedMissionRecipients.length === 0) {
      return alert("Sélectionne au moins un livreur connecté pour recevoir cette course !");
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
        userIds: selectedMissionRecipients,
      }),
    });

    setLoadingGeocode(false);

    if (response.ok) {
      setTitle('');
      setPickupInput('');
      setDeliveryInput('');
      setPickupCoords(null);
      setDeliveryCoords(null);
      if (activeUser) {
        loadUserMissions(activeUser);
      }
      setActiveTab('ACTIVE');
    }
  };

  const handleDeleteMission = async (id: number) => {
    if (!confirm("Voulez-vous vraiment annuler cette course ?")) return;
    const response = await fetch(`http://localhost:3000/missions/${id}`, { method: 'DELETE' });
    if (response.ok && activeUser) {
      loadUserMissions(activeUser);
    }
  };

  const missionRecipientOptions = allDbUsers
    .filter(user => (user.role || 'LIVREUR') === 'LIVREUR')
    .map(user => {
      const socketId = `intervenant_${String(user.firstName).toLowerCase()}_${user.id}`;
      return {
        socketId,
        label: user.firstName || socketId,
        isOnline: connectedDrivers.some(driver => driver.socketId === socketId),
      };
    });

  const activeMissions = missions.filter(m => m.status !== 'DELIVERED');
  const historyMissions = missions.filter(m => m.status === 'DELIVERED');
  const totalEarnings = historyMissions.reduce((sum, m) => sum + parseFloat(m.price), 0).toFixed(2);

  // RENDU : LOGIN SCREEN
  if (!isAdminAuthenticated) {
    return (
      <main className="min-h-screen bg-[#D9D9D9] flex items-center justify-center p-6 font-sans antialiased text-white">
        <div className="w-full max-w-md bg-[#F8FAFC] border border-slate-200/60 p-8 rounded-2xl shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-black">Droply Portal</h1>
            <p className="text-xs text-slate-900 font-medium">Console d'accès d'administration globale</p>
          </div>

          {authError && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs p-3 rounded-xl font-medium tracking-tight leading-relaxed text-center">
               {authError}
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1.5 uppercase tracking-wider text-[10px]">Identifiant de sécurité</label>
              <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="admin@droply.com" className="w-full px-3 py-2.5 bg-slate-000 border border-slate-200 rounded-xl text-black focus:outline-none focus:border-slate-400 transition font-medium" />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1.5 uppercase tracking-wider text-[10px]">Clé de passe</label>
              <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" className="w-full px-3 py-2.5 bg-slate-000 border border-slate-200 rounded-xl text-black focus:outline-none focus:border-slate-400 transition font-mono text-sm" />
            </div>

            <button type="submit" disabled={authLoading} className="w-full bg-slate-950 text-white font-semibold py-3 rounded-xl hover:bg-slate-800 transition shadow-sm tracking-wide mt-4 flex items-center justify-center">
              {authLoading ? 'Vérification...' : 'Ouvrir la session sécurisée'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // RENDU INTERFACE PRINCIPALE
  return (
    <main className="min-h-screen bg-[#F8FAFC] p-6 lg:p-10 font-sans antialiased text-slate-900">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER SUBTILE ET CLASSE AVEC SYSTEME DE NAVIGATION DE PAGE */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Droply Control Center</h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">Console de supervision de flotte en temps réel</p>
            <br />
            <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border text-[11px] font-medium tracking-wide uppercase shadow-sm transition-all duration-300 ${
              isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span>{isOnline ? 'Live stream actif' : 'Mode synchrone historique'}</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-3 self-start sm:self-center">
            
            {/* ⚡ NAV BUTTONS POUR ALLER DANS LE CENTRE DE CONTROLE SANS TOUCHER AU STYLE */}
            <button 
              onClick={() => setCurrentView('DASHBOARD')}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition shadow-sm border ${
                currentView === 'DASHBOARD' ? 'bg-slate-950 text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900'
              }`}
            >
              Moniteur Cartographique
            </button>

            <button 
              onClick={() => setCurrentView('CONTROL_CENTER')}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition shadow-sm border ${
                currentView === 'CONTROL_CENTER' ? 'bg-slate-950 text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900'
              }`}
            >
              Centre de Contrôle
            </button>



            <button onClick={handleAdminLogout} className="px-3 py-1.5 border border-slate-200 hover:border-slate-300 bg-white rounded-full text-[11px] text-slate-600 hover:text-slate-900 font-medium transition shadow-sm">
              Fermer la session 
            </button>
          </div>
        </div>

        {/* ⚡ APPAREIL MULTI-VUES : COMMUTATION DU CONTENU SANS MODIFIER LE STYLE GENERAL */}
        {currentView === 'CONTROL_CENTER' ? (
          
          /* ========================================================================= */
          /* ⚡ VUE B : CENTRE DE CONTROLE (TOUS LES COMPTES, CHANGEMENT ROLES & BAN) */
          /* ========================================================================= */
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Registre Global des Comptes</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">Modification des privilèges (Admin, Client, Livreur) et maintenance de la base de données</p>
            </div>

            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-4 font-semibold">Opérateur / Prénom</th>
                    <th className="p-4 font-semibold">Adresse Électronique</th>
                    <th className="p-4 font-semibold">Privilège Système</th>
                    <th className="p-4 font-semibold text-right">Actions de Sécurité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {allDbUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="p-4 font-semibold text-slate-950">{user.firstName}</td>
                      <td className="p-4 font-mono text-slate-500 text-[11px]">{user.email}</td>
                      <td className="p-4">
                        
                        {/* ⚡ SELECTEUR DE RÔLE DÉROULANT : ADMIN, CLIENT, LIVREUR */}
                        <select 
                          value={user.role || 'LIVREUR'} 
                          onChange={(e) => handleChangeRoleInControlCenter(user.id, e.target.value)}
                          className="bg-slate-50 border border-slate-200 text-slate-800 rounded-lg p-1.5 text-xs font-semibold focus:outline-none focus:border-slate-400 transition"
                        >
                          <option value="ADMIN">ADMIN</option>
                          <option value="LIVREUR">LIVREUR</option>
                          <option value="CLIENT">CLIENT</option>
                        </select>

                      </td>
                      <td className="p-4 text-right">
                        <button 
                          onClick={() => handleDeleteUserInControlCenter(user.id, user.firstName)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 text-[11px] font-semibold rounded-xl transition cursor-pointer"
                        >
                          Supprimer le compte
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        ) : (

          /* ========================================================================= */
          /* ⚡ VUE A : INDEX MAP OPERATIONNEL (TON DASHBOARD ORIGINAL SANS ALTERATION) */
          /* ========================================================================= */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
            
            {/* PANEL DE GAUCHE : OUTILS ET LISTES */}
            <div className="space-y-6 lg:col-span-1">
              
              {/* ⚡ COMPOSANT INTERVENANTS EN LIGNE CONVERTI EN MENU DÉROULANT CLIQUABLE */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-slate-950" />
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Opérateurs en ligne</h3>
                
                <div className="mt-2 relative">
                  {connectedDrivers.length === 0 ? (
                    <p className="text-xs font-semibold text-slate-400 italic">Aucun livreur en ligne...</p>
                  ) : (
                    // ⚡ LE SELECTEUR DÉROULANT : Permet d'isoler un utilisateur connecté en un clic
                    <select
                      value={activeUser || ''}
                      onChange={(e) => handleSelectConnectedDriver(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2 text-xs font-semibold focus:outline-none focus:border-slate-400 cursor-pointer"
                    >
                      <option value="" disabled>-- Choisir un livreur connecté ({connectedDrivers.length}) --</option>
                      {connectedDrivers.map((driver) => (
                        <option key={driver.socketId} value={driver.socketId}>
                          @{driver.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className={`mt-2 text-xs font-medium tracking-tight ${isOnline ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {lastSeen}
                </div>
              </div>

              {/* FORMULAIRE DE CRÉATION DE MISSION */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Assigner un ordre</h3>
                </div>
                <form onSubmit={handleSubmitMission} className="space-y-4 text-xs">
                  
	                  <div>
	                    <label className="block text-slate-500 font-medium mb-1.5">Intitulé de la course</label>
	                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Hub expédition colis #902" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:border-slate-400 transition" />
	                  </div>

	                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/60">
	                    <div className="flex items-center justify-between gap-2 mb-2">
	                      <label className="block text-slate-500 font-medium">Destinataires</label>
	                      <div className="flex items-center gap-2">
	                        <button type="button" onClick={handleSelectAllMissionRecipients} className="text-[10px] font-bold text-slate-500 hover:text-slate-950 uppercase tracking-wider">
	                          Tous
	                        </button>
	                        <button type="button" onClick={handleClearMissionRecipients} className="text-[10px] font-bold text-slate-400 hover:text-rose-600 uppercase tracking-wider">
	                          Aucun
	                        </button>
	                      </div>
	                    </div>

                    {missionRecipientOptions.length === 0 ? (
                      <p className="text-[11px] text-slate-400 font-medium">Aucun compte livreur trouvé.</p>
                    ) : (
                      <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                        {missionRecipientOptions.map((driver) => (
                          <label key={driver.socketId} className="flex items-center justify-between gap-3 bg-white border border-slate-100 rounded-lg px-3 py-2 cursor-pointer hover:border-slate-300 transition">
                            <span className="min-w-0">
                              <span className="block text-[11px] font-semibold text-slate-700 truncate">@{driver.label}</span>
                              <span className={`block text-[9px] font-bold uppercase tracking-wider ${driver.isOnline ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {driver.isOnline ? 'En ligne' : 'Hors ligne'}
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              checked={selectedMissionRecipients.includes(driver.socketId)}
                              onChange={() => handleToggleMissionRecipient(driver.socketId)}
                              className="h-4 w-4 accent-slate-950 shrink-0"
                            />
                          </label>
                        ))}
                      </div>
                    )}

	                    <p className="mt-2 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
	                      {selectedMissionRecipients.length} livreur(s) sélectionné(s)
	                    </p>
	                  </div>
	                  
	                  {/* Départ */}
                  <div className="relative">
                    <label className="block text-slate-500 font-medium mb-1.5">Adresse de chargement</label>
                    <input type="text" value={pickupInput} onChange={(e) => { setPickupCoords(null); setPickupInput(e.target.value); }} placeholder="Rechercher le départ..." className={`w-full px-3 py-2 border rounded-xl text-slate-800 font-medium focus:outline-none transition ${pickupCoords ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-200 focus:border-slate-400'}`} />
                    {pickupSuggestions.length > 0 && (
                      <ul className="absolute z-50 left-0 right-0 bg-white border border-slate-200 rounded-xl mt-1 max-h-40 overflow-y-auto shadow-lg divide-y divide-slate-100">
                        {pickupSuggestions.map((s, idx) => (
                          <li key={idx} onClick={() => {
                            setIsPickupSelected(true);
                            setPickupInput(s.display_name);
                            setPickupCoords({ lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
                            setPickupSuggestions([]);
                          }} className="p-2.5 text-[11px] hover:bg-slate-50 cursor-pointer text-slate-600 truncate transition-colors">{s.display_name}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Arrivée */}
                  <div className="relative">
                    <label className="block text-slate-500 font-medium mb-1.5">Destination de livraison</label>
                    <input type="text" value={deliveryInput} onChange={(e) => { setDeliveryCoords(null); setDeliveryInput(e.target.value); }} placeholder="Rechercher l'arrivée..." className={`w-full px-3 py-2 border rounded-xl text-slate-800 font-medium focus:outline-none transition ${deliveryCoords ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-200 focus:border-slate-400'}`} />
                    {deliverySuggestions.length > 0 && (
                      <ul className="absolute z-50 left-0 right-0 bg-white border border-slate-200 rounded-xl mt-1 max-h-40 overflow-y-auto shadow-lg divide-y divide-slate-100">
                        {deliverySuggestions.map((s, idx) => (
                          <li key={idx} onClick={() => {
                            setIsDeliverySelected(true);
                            setDeliveryInput(s.display_name);
                            setDeliveryCoords({ lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
                            setDeliverySuggestions([]);
                          }} className="p-2.5 text-[11px] hover:bg-slate-50 cursor-pointer text-slate-600 truncate transition-colors">{s.display_name}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-500 font-medium mb-1.5">Honoraires de course (€)</label>
                    <input type="text" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 font-mono font-bold focus:outline-none" />
                  </div>

	                  <button type="submit" disabled={loadingGeocode || !pickupCoords || !deliveryCoords || selectedMissionRecipients.length === 0} className="w-full bg-slate-950 text-white font-medium py-2.5 rounded-xl hover:bg-slate-800 transition shadow-sm disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 border border-transparent tracking-wide mt-2">
	                    {selectedMissionRecipients.length > 0 ? `Émettre vers ${selectedMissionRecipients.length} livreur(s)` : 'Choisir les destinataires'}
	                  </button>
                </form>
              </div>

              {/* ONGLET CONSOLE DE LOGS / COURSES */}
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
                
                {/* Onglets */}
                <div className="flex border-b border-slate-100 text-[11px] font-bold bg-slate-50/80 p-1">
                  <button 
                    onClick={() => setActiveTab('ACTIVE')}
                    className={`flex-1 py-2 text-center rounded-xl transition-all duration-200 ${activeTab === 'ACTIVE' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Opérations ({activeMissions.length})
                  </button>
                  <button 
                    onClick={() => setActiveTab('HISTORY')}
                    className={`flex-1 py-2 text-center rounded-xl transition-all duration-200 ${activeTab === 'HISTORY' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Historique ({historyMissions.length})
                  </button>
                </div>

                <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100">
                  {/* COURSES EN COURS */}
                  {activeTab === 'ACTIVE' && (
                    activeMissions.length === 0 ? (
                      <div className="px-5 py-8 text-center"><p className="text-xs text-slate-400 font-medium">Aucun vecteur en transit.</p></div>
                    ) : (
                      activeMissions.map((m) => (
                        <div key={m.id} className="px-4 py-3.5 hover:bg-slate-50/60 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-950 truncate tracking-tight">{m.title}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{m.price} €</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] tracking-wider uppercase border ${
                                m.status === 'ACCEPTED' ? 'bg-slate-950 text-white border-transparent' :
                                m.status === 'REFUSED'  ? 'bg-rose-50 text-rose-700 border-rose-100' :
                                                          'bg-amber-50 text-amber-700 border-amber-100'
                              }`}>
                                {m.status === 'PENDING'   && ' Attente'}
                                {m.status === 'ACCEPTED'  && ' Transit'}
                                {m.status === 'REFUSED'   && ' Refusé'}
                              </span>
                              {m.status === 'PENDING' && (
                                <button onClick={() => handleDeleteMission(m.id)} className="p-1 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition border border-transparent hover:border-rose-100 cursor-pointer" type="button">
                                  <svg xmlns="http://www.w3.org/2000/xl" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              )}
                            </div>
                          </div>
                          {m.validationCode && (
                            <div className="mt-2.5 flex items-center justify-between bg-slate-50 border border-slate-200/60 rounded-xl px-3 py-1.5">
                              <span className="text-slate-400 text-[9px] font-bold uppercase tracking-widest">Token Client</span>
                              <span className="text-slate-950 font-mono font-bold text-xs tracking-wider">{m.validationCode}</span>
                            </div>
                          )}
                        </div>
                      ))
                    )
                  )}

                  {/* HISTORIQUE */}
                  {activeTab === 'HISTORY' && (
                    <div className="divide-y divide-slate-100">
                      <div className="bg-slate-950 px-4 py-3 flex justify-between items-center text-[11px] text-white">
                        <span className="font-medium opacity-70">Volume total généré</span>
                        <span className="font-mono font-bold text-xs text-emerald-400">{totalEarnings} €</span>
                      </div>

                      {historyMissions.length === 0 ? (
                        <div className="px-5 py-8 text-center"><p className="text-xs text-slate-400 font-medium">L'archive est vierge.</p></div>
                      ) : (
                        historyMissions.map((m) => (
                          <div key={m.id} className="px-4 py-3.5 bg-white hover:bg-slate-50/50 transition-colors">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate tracking-tight">{m.title}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Acheminement validé</p>
                              </div>
                              <div className="shrink-0">
                                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 border border-emerald-100/60 rounded-lg font-mono">+{m.price} €</span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* PANEL DE DROITE : BLOC CARTE GRAND FORMAT */}
            <div className="lg:col-span-3 rounded-2xl overflow-hidden border border-slate-200/70 shadow-md bg-white p-2">
              <MapWithNoSSR />
            </div>
            
          </div>
        )}
      </div>
    </main>
  );
}
