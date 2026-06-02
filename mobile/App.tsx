import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Platform, TouchableOpacity, ScrollView, Image, TextInput, Modal, Linking } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { io, Socket } from 'socket.io-client';
// ⚡ IMPORT DU MODULE DE STOCKAGE NATIF
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = 'http://172.20.10.7:3000'; // Mets bien l'IP de ton Mac ici

export default function App() {
  // Navigation Screens
  const [screen, setScreen] = useState<'LOGIN' | 'REGISTER' | 'HOME'>('LOGIN');
  const [activeTab, setActiveTab] = useState<'MARKET' | 'SETTINGS'>('MARKET');
  const [appLoading, setAppLoading] = useState<boolean>(true); // Écran d'attente initial

  // États Formulaires
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // État Utilisateur connecté
  const [currentUser, setCurrentUser] = useState<any>(null);

  // États Techniques
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [availableMissions, setAvailableMissions] = useState<any[]>([]);
  const [activeMission, setActiveMission] = useState<any | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [incomingMission, setIncomingMission] = useState<any | null>(null);
  const [completedCount, setCompletedCount] = useState<number>(0);

  // ⚡ ÉTAT SAISIE DU CODE CLIENT
  const [inputCode, setInputCode] = useState('');

  // Paramètres : champs modifiables
  const [editFirstName, setEditFirstName] = useState('');
  const [editImage, setEditImage] = useState<string | null>(null);

  // ⚡ AUTO-CONNEXION : Vérifie au tout premier démarrage si une session existe
  useEffect(() => {
    const checkSavedSession = async () => {
      try {
        const savedUserJson = await AsyncStorage.getItem('@droply_user_session');
        if (savedUserJson !== null) {
          const user = JSON.parse(savedUserJson);
          console.log("🔒 Session trouvée en mémoire pour :", user.firstName);
          startLivreurSession(user);
        } else {
          setAppLoading(false);
        }
      } catch (err) {
        console.error("Erreur lecture session", err);
        setAppLoading(false);
      }
    };
    checkSavedSession();
  }, []);

  // Sélection de la photo de profil
  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.3,
    });
    if (!result.canceled) {
      setProfileImage(result.assets[0].uri);
    }
  };

  // Sélection de la photo depuis les paramètres
  const pickImageSettings = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.3,
    });
    if (!result.canceled) {
      setEditImage(result.assets[0].uri);
    }
  };

  // Sauvegarder les modifications du profil (local uniquement)
  const saveProfileChanges = async () => {
    if (!editFirstName.trim()) return alert("Le prénom ne peut pas être vide !");
    const updatedUser = {
      ...currentUser,
      firstName: editFirstName,
      profileImage: editImage,
    };
    setCurrentUser(updatedUser);
    // On met aussi à jour la mémoire persistante locale
    await AsyncStorage.setItem('@droply_user_session', JSON.stringify(updatedUser));
    alert("Profil mis à jour ✅");
  };

  // ⚡ LOGIQUE DE DÉCONNEXION (Vide la mémoire et revient au Login)
  const handleLogout = async () => {
    try {
      if (socket) socket.disconnect();
      await AsyncStorage.removeItem('@droply_user_session');
      setCurrentUser(null);
      setFirstName('');
      setEmail('');
      setPassword('');
      setProfileImage(null);
      setActiveMission(null);
      setAvailableMissions([]);
      setScreen('LOGIN');
      setActiveTab('MARKET');
    } catch (err) {
      console.error(err);
    }
  };

  // ⚡ ITINÉRAIRE 1 : Aller au point de récupération (Magasin / Expéditeur)
  const openGPSPickup = () => {
    if (!activeMission) return;
    const lat = activeMission.pickupLatitude;
    const lng = activeMission.pickupLongitude;
    const label = encodeURIComponent("Récupération : " + activeMission.title);

    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    });

    Linking.openURL(url).catch((err) => console.error("Erreur GPS Récupération :", err));
  };

  // ⚡ ITINÉRAIRE 2 : Aller au point de livraison finale (Client)
  const openGPSDelivery = () => {
    if (!activeMission) return;
    const lat = activeMission.deliveryLatitude;
    const lng = activeMission.deliveryLongitude;
    const label = encodeURIComponent("Livraison : " + activeMission.title);

    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    });

    Linking.openURL(url).catch((err) => console.error("Erreur GPS Livraison :", err));
  };

  // ⚡ FONCTION DE CALCUL HAVERSINE SUR LE MOBILE
  const calculateDistanceLocally = (userLat: number, userLng: number, targetLat: number, targetLng: number) => {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (targetLat - userLat) * (Math.PI / 180);
    const dLng = (targetLng - userLng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(userLat * (Math.PI / 180)) * Math.cos(targetLat * (Math.PI / 180)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(1);
  };

  // Initialiser les WebSockets et le GPS après Auth réussie
  const startLivreurSession = (user: any) => {
    setCurrentUser(user);
    setEditFirstName(user.firstName);
    setEditImage(user.profileImage || null);
    const userId = `intervenant_${user.firstName.toLowerCase()}_${user.id}`;

    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => setConnected(true));
    newSocket.on('disconnect', () => setConnected(false));

    // ⚡ INTERCEPTION DE L'ALERTE EN DIRECT AVEC RE-CALCUL GÉOSPATIAL IMMÉDIAT
    newSocket.on('new_mission_alert', (mission: any) => {
      if (mission.status === 'PENDING') {
        let updatedMission = { ...mission };
        
        setLocation((currentLocation) => {
          if (currentLocation) {
            updatedMission.distanceToPickup = calculateDistanceLocally(
              currentLocation.coords.latitude,
              currentLocation.coords.longitude,
              mission.pickupLatitude,
              mission.pickupLongitude
            );
          }
          return currentLocation;
        });

        setAvailableMissions(prev => [updatedMission, ...prev]);
        setIncomingMission(updatedMission);
        setModalVisible(true);
      }
    });

    newSocket.on('admin_mission_updated', (updatedMission: any) => {
      const updatedId = Number(updatedMission.id);

      if (updatedMission.status === 'DELETED') {
        setAvailableMissions(prev => prev.filter(m => Number(m.id) !== updatedId));
        setIncomingMission((currentIncoming: any) => {
          if (currentIncoming && Number(currentIncoming.id) === updatedId) {
            setModalVisible(false);
            return null;
          }
          return currentIncoming;
        });
      } else if (updatedMission.status === 'DELIVERED') {
        setActiveMission(updatedMission);
      }
    });

    // CORRECTIF PERSISTANCE : Récupération intelligente au chargement
    fetch(`${BACKEND_URL}/missions/user/${userId}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAvailableMissions(data.filter(m => m.status === 'PENDING'));
          setCompletedCount(data.filter(m => m.status === 'DELIVERED').length);

          const ongoingMission = data.find(m => m.status === 'ACCEPTED');
          if (ongoingMission) {
            setActiveMission(ongoingMission);
          }
        }
      })
      .catch(err => console.error(err));

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 5 },
        (newLocation) => {
          setLocation(newLocation);
          newSocket.emit('update_location', {
            userId: userId,
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
          });
        }
      );
    })();

    setScreen('HOME');
    setAppLoading(false); // Arrête le loader d'initialisation
  };

  // Soumettre l'Inscription
  const handleRegister = async () => {
    if (!firstName || !email || !password) return alert("Remplis tous les champs !");
    
    const res = await fetch(`${BACKEND_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, email, password, profileImage }),
    });
    const data = await res.json();

    if (data.error) return alert(data.error);
    if (data.success) {
      alert("Compte créé avec succès !");
      // ⚡ SAUVEGARDE EN MÉMOIRE DE LA SESSION REUSSIE
      await AsyncStorage.setItem('@droply_user_session', JSON.stringify(data.user));
      startLivreurSession(data.user);
    }
  };

  // Soumettre la Connexion
  const handleLogin = async () => {
    if (!email || !password) return alert("Remplis l'email et le mot de passe !");
    
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (data.error) return alert(data.error);
    if (data.success) {
      // ⚡ SAUVEGARDE EN MÉMOIRE DE LA SESSION REUSSIE
      await AsyncStorage.setItem('@droply_user_session', JSON.stringify(data.user));
      startLivreurSession(data.user);
    }
  };

  // Logique acceptation/clôture missions
  const acceptMission = async (missionId: number) => {
    try {
      const res = await fetch(`${BACKEND_URL}/missions/${missionId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACCEPTED' }),
      });
      
      if (!res.ok) {
        alert("Désolé, cette course n'est plus disponible !");
        setAvailableMissions(prev => prev.filter(m => Number(m.id) !== Number(missionId)));
        setModalVisible(false);
        return;
      }

      const updated = await res.json();
      setActiveMission(updated);
      setAvailableMissions(prev => prev.filter(m => Number(m.id) !== Number(missionId)));
      setModalVisible(false);
      setIncomingMission(null);
    } catch (err) { 
      console.error(err); 
      alert("Erreur : La course a été annulée ou acceptée.");
    }
  };

  // VALIDATION PAR CODE SECRET OBLIGATOIRE
  const completeMission = async () => {
    if (!activeMission) return;
    if (!inputCode) return alert("Veuillez demander le code de sécurité à 3 chiffres au client !");

    try {
      const res = await fetch(`${BACKEND_URL}/missions/${activeMission.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DELIVERED', code: inputCode }),
      });

      const data = await res.json();

      if (data.error || res.status >= 400) {
        return alert(data.message || "Code de validation incorrect ! Demandez le bon code au client.");
      }

      setActiveMission(data);
      setCompletedCount(prev => prev + 1);
      setInputCode('');
    } catch (err) { 
      console.error(err); 
    }
  };

  // ÉCRAN BLANC DE TRANSITION PENDANT LA LECTURE DU STOCKAGE MEMOIRE
  if (appLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#1C1C1E', marginBottom: 10 }}>Droply Express</Text>
        <Text style={{ fontSize: 12, color: '#8E8E93' }}>Vérification de la session en cours...</Text>
      </View>
    );
  }

  // --- RENDU ÉCRAN : CONNEXION ---
  if (screen === 'LOGIN') {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.authTitle}>🔐 Connexion Droply</Text>
        <Text style={styles.authSubtitle}>Heureux de te revoir ! Connecte-toi pour rouler.</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Adresse Email</Text>
          <TextInput style={styles.input} keyboardType="email-address" autoCapitalize="none" placeholder="livreur@droply.com" placeholderTextColor="#AEAEB2" value={email} onChangeText={setEmail} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Mot de passe</Text>
          <TextInput style={styles.input} secureTextEntry placeholder="••••••••" placeholderTextColor="#AEAEB2" value={password} onChangeText={setPassword} />
        </View>

        <TouchableOpacity style={styles.submitAuthButton} onPress={handleLogin}>
          <Text style={styles.buttonText}>Se connecter</Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ marginTop: 20 }} onPress={() => setScreen('REGISTER')}>
          <Text style={{ color: '#007AFF', textAlign: 'center', fontWeight: '600' }}>Pas de compte ? S'inscrire</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- RENDU ÉCRAN : INSCRIPTION ---
  if (screen === 'REGISTER') {
    return (
      <ScrollView contentContainerStyle={[styles.authContainer, { paddingVertical: 60 }]}>
        <Text style={styles.authTitle}>🚀 Créer un Compte</Text>
        
        <TouchableOpacity style={styles.avatarPicker} onPress={pickImage}>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>📸 Photo de profil</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Prénom</Text>
          <TextInput style={styles.input} placeholder="Jugurta" placeholderTextColor="#AEAEB2" value={firstName} onChangeText={setFirstName} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Adresse Email</Text>
          <TextInput style={styles.input} keyboardType="email-address" autoCapitalize="none" placeholder="jean@gmail.com" placeholderTextColor="#AEAEB2" value={email} onChangeText={setEmail} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Mot de passe</Text>
          <TextInput style={styles.input} secureTextEntry placeholder="Créer un mot de passe" placeholderTextColor="#AEAEB2" value={password} onChangeText={setPassword} />
        </View>

        <TouchableOpacity style={styles.submitAuthButton} onPress={handleRegister}>
          <Text style={styles.buttonText}>S'inscrire et commencer</Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ marginTop: 20 }} onPress={() => setScreen('LOGIN')}>
          <Text style={{ color: '#007AFF', textAlign: 'center', fontWeight: '600' }}>Déjà inscrit ? Se connecter</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // --- RENDU ÉCRAN : DASHBOARD HOME ---
  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.headerProfile}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image
            source={currentUser?.profileImage ? { uri: currentUser.profileImage } : { uri: 'https://via.placeholder.com/150' }}
            style={styles.miniAvatar}
          />
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.welcomeText}>👋 Bienvenue, {currentUser?.firstName} !</Text>
            <Text style={styles.roleText}>{currentUser?.email}</Text>
          </View>
        </View>
        <View style={[styles.miniStatusBadge, { backgroundColor: connected ? '#4CD964' : '#FF3B30' }]} />
      </View>

      {/* STATS RAPIDES */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{completedCount}</Text>
          <Text style={styles.statLabel}>Courses effectuées</Text>
        </View>
        <View style={[styles.statCard, { borderColor: '#007AFF22', backgroundColor: '#F0F6FF' }]}>
          <Text style={[styles.statNumber, { color: '#007AFF' }]}>{availableMissions.length}</Text>
          <Text style={styles.statLabel}>Disponibles</Text>
        </View>
      </View>

      {/* CONTENU PRINCIPAL */}
      <View style={{ flex: 1 }}>
        {activeTab === 'SETTINGS' ? (
          /* ——— PAGE PARAMÈTRES ——— */
          <ScrollView contentContainerStyle={styles.settingsContainer}>
            <Text style={styles.settingsTitle}> Mon Profil</Text>

            {/* Avatar modifiable */}
            <TouchableOpacity style={styles.avatarPicker} onPress={pickImageSettings}>
              {editImage ? (
                <Image source={{ uri: editImage }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarPlaceholderText}> Changer la photo</Text>
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.settingsHint}>Appuie sur la photo pour la modifier</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Prénom</Text>
              <TextInput
                style={styles.input}
                value={editFirstName}
                onChangeText={setEditFirstName}
                placeholder="Ton prénom"
                placeholderTextColor="#AEAEB2"
              />
            </View>

            <View style={[styles.inputGroup, { opacity: 0.5 }]}>
              <Text style={styles.inputLabel}>Email (non modifiable)</Text>
              <TextInput
                style={styles.input}
                value={currentUser?.email}
                editable={false}
              />
            </View>

            <TouchableOpacity style={styles.saveChangesButton} onPress={saveProfileChanges}>
              <Text style={styles.buttonText}> Sauvegarder les modifications</Text>
            </TouchableOpacity>

            {/* ⚡ BOUTON DE DÉCONNEXION LIÉ À LOGOUT LOGIC */}
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.buttonText}>🔒 Déconnexion sécurisée</Text>
            </TouchableOpacity>
          </ScrollView>

        ) : (
          /* ——— PAGE MARCHÉ / MISSIONS ——— */
          <>
            {activeMission && activeMission.status === 'ACCEPTED' ? (
              <View style={{ flex: 1, width: '100%' }}>
                <View style={styles.missionActiveCard}>
                  <Text style={styles.missionActiveTitle}>🏃 MISSION EN COURS D'EXÉCUTION</Text>
                  <Text style={styles.missionTitleText}>{activeMission.title}</Text>
                  <Text style={styles.missionPriceText}>{activeMission.price} €</Text>
                  <Text style={styles.missionDesc}>{activeMission.description}</Text>

                  <View style={{ marginTop: 15, borderTopWidth: 1, borderColor: '#3A3A3C', paddingTop: 15 }}>
                    <Text style={{ color: '#FF9500', fontWeight: 'bold', fontSize: 11, marginBottom: 5 }}> CODE DE VALIDATION EXIGÉ (3 CHIFFRES)</Text>
                    <TextInput
                      style={styles.codeInputField}
                      placeholder="---"
                      placeholderTextColor="#8E8E93"
                      keyboardType="number-pad"
                      maxLength={3}
                      value={inputCode}
                      onChangeText={setInputCode}
                    />
                  </View>
                  <TouchableOpacity style={styles.completeButton} onPress={completeMission}>
                    <Text style={styles.buttonText}>✓ Confirmer le code & Terminer la course</Text>
                  </TouchableOpacity>

                  <View style={{ marginVertical: 10 }}>
                    <TouchableOpacity style={[styles.navigationGpsButton, { backgroundColor: '#FF9500' }]} onPress={openGPSPickup}>
                      <Text style={styles.buttonText}> Étape 1 : Aller récupérer le colis</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.navigationGpsButton, { backgroundColor: '#007AFF', marginTop: 10 }]} onPress={openGPSDelivery}>
                      <Text style={styles.buttonText}> Étape 2 : Aller livrer le client</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

            ) : activeMission && activeMission.status === 'DELIVERED' ? (
              <View style={styles.successCard}>
                <Text style={styles.successTitle}>🎉 Bravo {currentUser?.firstName} !</Text>
                <Text style={styles.successText}>Course validée avec succès. Commission de {activeMission.price} € ajoutée à ton compte.</Text>
                <TouchableOpacity style={styles.clearButton} onPress={() => setActiveMission(null)}>
                  <Text style={styles.clearButtonText}>Retourner au marché</Text>
                </TouchableOpacity>
              </View>

            ) : (
              <View style={{ flex: 1, width: '100%' }}>
                <Text style={styles.marketTitle}>💼 Missions disponibles autour de toi :</Text>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
                  {availableMissions.length === 0 ? (
                    <View style={styles.emptyMarket}>
                      <Text style={styles.emptyMarketText}>⏳ Aucune offre pour le moment...</Text>
                    </View>
                  ) : (
                    availableMissions.map((m) => (
                      <View key={m.id} style={styles.marketCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={styles.marketCardTitle}>{m.title}</Text>
                            {m.distanceToPickup && (
                              <Text style={{ color: '#007AFF', fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                                📍 À {m.distanceToPickup} km de toi
                              </Text>
                            )}
                            <Text style={styles.marketCardDesc} numberOfLines={2}>{m.description}</Text>
                          </View>
                          <Text style={styles.marketCardPrice}>{m.price} €</Text>
                        </View>
                        <TouchableOpacity style={styles.acceptJobButton} onPress={() => acceptMission(m.id)}>
                          <Text style={styles.acceptJobButtonText}>⚡ Accepter la course</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </View>

      {/* BARRE DE NAVIGATION BAS */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('MARKET')}>
          <Text style={[styles.tabIcon, activeTab === 'MARKET' && styles.tabIconActive]}>🏠</Text>
          <Text style={[styles.tabLabel, activeTab === 'MARKET' && styles.tabLabelActive]}>Accueil</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('SETTINGS')}>
          <Text style={[styles.tabIcon, activeTab === 'SETTINGS' && styles.tabIconActive]}>⚙️</Text>
          <Text style={[styles.tabLabel, activeTab === 'SETTINGS' && styles.tabLabelActive]}>Paramètres</Text>
        </TouchableOpacity>
      </View>

      {/* MODAL UBER POPUP */}
      <Modal animationType="slide" transparent={true} visible={modalVisible}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalBadge}>⚡ OFFRE EN DIRECT</Text>
            <Text style={styles.modalTitle}>{incomingMission?.title}</Text>
            <Text style={styles.modalPrice}>{incomingMission?.price} €</Text>
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.declineButton} onPress={() => { setModalVisible(false); setIncomingMission(null); }}>
                <Text style={[styles.buttonText, { color: '#FF3B30' }]}>Ignorer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptButton} onPress={() => acceptMission(incomingMission?.id)}>
                <Text style={styles.buttonText}>Accepter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  authContainer: { flex: 1, backgroundColor: '#FFF', justifyContent: 'center', padding: 24 },
  authTitle: { fontSize: 26, fontWeight: '800', color: '#1C1C1E', textAlign: 'center' },
  authSubtitle: { color: '#8E8E93', fontSize: 14, marginTop: 5, marginBottom: 30, textAlign: 'center' },
  avatarPicker: { alignSelf: 'center', marginVertical: 20 },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#E5E5EA' },
  avatarPlaceholderText: { fontSize: 11, color: '#007AFF', fontWeight: '600', textAlign: 'center' },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#8E8E93', marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: '#F2F2F7', padding: 14, borderRadius: 10, fontSize: 15, color: '#1C1C1E' },
  submitAuthButton: { backgroundColor: '#1C1C1E', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },

  container: { flex: 1, backgroundColor: '#F5F5F7', paddingTop: Platform.OS === 'ios' ? 60 : 30, paddingHorizontal: 16 },
  headerProfile: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 14, marginBottom: 12 },
  miniAvatar: { width: 40, height: 40, borderRadius: 20 },
  welcomeText: { fontSize: 15, fontWeight: 'bold', color: '#1C1C1E' },
  roleText: { fontSize: 12, color: '#8E8E93' },
  miniStatusBadge: { width: 10, height: 10, borderRadius: 5 },

  // Stats rapides
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#F0FFF4', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#4CD96422' },
  statNumber: { fontSize: 26, fontWeight: '800', color: '#4CD964' },
  statLabel: { fontSize: 11, color: '#8E8E93', fontWeight: '600', marginTop: 2, textAlign: 'center' },

  marketTitle: { fontSize: 15, fontWeight: '700', color: '#1C1C1E', marginBottom: 10 },
  emptyMarket: { backgroundColor: '#FFF', padding: 30, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E5E5EA' },
  emptyMarketText: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  marketCard: { backgroundColor: '#FFF', padding: 15, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E5EA' },
  marketCardTitle: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  marketCardDesc: { fontSize: 12, color: '#8E8E93', marginTop: 3 },
  marketCardPrice: { fontSize: 16, fontWeight: '800', color: '#4CD964' },
  acceptJobButton: { backgroundColor: '#1C1C1E', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  acceptJobButtonText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  missionActiveCard: { backgroundColor: '#1C1C1E', padding: 20, borderRadius: 16 },
  missionActiveTitle: { color: '#FF9500', fontWeight: 'bold', fontSize: 11 },
  missionTitleText: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginTop: 5 },
  missionPriceText: { color: '#4CD964', fontSize: 22, fontWeight: '800' },
  missionDesc: { color: '#AEAEB2', fontSize: 13, marginVertical: 8 },
  completeButton: { backgroundColor: '#4CD964', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  successCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: '#4CD964' },
  successTitle: { fontSize: 16, fontWeight: 'bold', color: '#4CD964' },
  successText: { fontSize: 13, color: '#3A3A3C', textAlign: 'center', marginTop: 5 },
  clearButton: { marginTop: 15, backgroundColor: '#F2F2F7', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8 },
  clearButtonText: { color: '#1C1C1E', fontWeight: '600' },

  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E5EA', paddingBottom: Platform.OS === 'ios' ? 20 : 8, paddingTop: 8 },
  tabItem: { flex: 1, alignItems: 'center', gap: 2 },
  tabIcon: { fontSize: 22 },
  tabIconActive: { opacity: 1 },
  tabLabel: { fontSize: 11, color: '#8E8E93', fontWeight: '600' },
  tabLabelActive: { color: '#1C1C1E', fontWeight: '700' },

  // Paramètres
  settingsContainer: { paddingBottom: 40, paddingTop: 10 },
  settingsTitle: { fontSize: 20, fontWeight: '800', color: '#1C1C1E', marginBottom: 4 },
  settingsHint: { textAlign: 'center', color: '#8E8E93', fontSize: 12, marginBottom: 20 },
  saveChangesButton: { backgroundColor: '#1C1C1E', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  logoutButton: { backgroundColor: '#FF3B30', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 25 },

  // Modal
  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, alignItems: 'center' },
  modalBadge: { color: '#007AFF', fontWeight: 'bold', fontSize: 10, backgroundColor: '#E5F1FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1C1C1E', marginTop: 8 },
  modalPrice: { fontSize: 28, fontWeight: '800', color: '#4CD964', marginVertical: 5 },
  modalButtonsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginTop: 15 },
  declineButton: { width: '46%', padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#FFE5E5' },
  acceptButton: { width: '46%', padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#1C1C1E' },

  // GPS & code
  navigationGpsButton: { padding: 14, borderRadius: 10, alignItems: 'center' },
  codeInputField: { backgroundColor: '#2C2C2E', padding: 12, borderRadius: 8, color: '#FFF', fontSize: 20, fontWeight: 'bold', textAlign: 'center', letterSpacing: 8, marginVertical: 8 },
});