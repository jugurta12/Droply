import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Platform, TouchableOpacity, ScrollView, Image, TextInput, Modal } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { io, Socket } from 'socket.io-client';

const BACKEND_URL = 'http://172.20.10.7:3000'; // Mets bien l'IP de ton Mac ici

export default function App() {
  // Navigation Screens
  const [screen, setScreen] = useState<'LOGIN' | 'REGISTER' | 'HOME'>('LOGIN');
  
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

  // Initialiser les WebSockets et le GPS après Auth réussie
  const startLivreurSession = (user: any) => {
    setCurrentUser(user);
    const userId = `intervenant_${user.firstName.toLowerCase()}_${user.id}`;

    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => setConnected(true));
    newSocket.on('disconnect', () => setConnected(false));

    newSocket.on('new_mission_alert', (mission: any) => {
      if (mission.status === 'PENDING') {
        setAvailableMissions(prev => [mission, ...prev]);
        setIncomingMission(mission);
        setModalVisible(true);
      }
    });

    // Écouter les mises à jour de statut globales (Livraison, Annulation...)
    newSocket.on('admin_mission_updated', (updatedMission: any) => {
      // 🚀 CORRECTIF SÉCURITÉ : Conversion forcée en Number pour éviter le bug String/Number
      const updatedId = Number(updatedMission.id);

      if (updatedMission.status === 'DELETED') {
        // 🗑️ 1. Retirer du marché en direct
        setAvailableMissions(prev => prev.filter(m => Number(m.id) !== updatedId));
        
        // 🗑️ 2. Fermer la modal si elle était ouverte sur CETTE mission
        setIncomingMission((currentIncoming: any) => {
          if (currentIncoming && Number(currentIncoming.id) === updatedId) {
            setModalVisible(false);
            return null;
          }
          return currentIncoming;
        });
        console.log(`🗑️ Mission ${updatedId} effacée du mobile en live.`);
      } else if (updatedMission.status === 'DELIVERED') {
        setActiveMission(updatedMission);
      }
    });

    // 🚀 CORRECTIF ID DYNAMIQUE : On charge le marché avec le VRAI userId dynamique du mec connecté
    fetch(`${BACKEND_URL}/missions/user/${userId}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAvailableMissions(data.filter(m => m.status === 'PENDING'));
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
      
      // Si la mission a été supprimée entre-temps par l'admin, le serveur renverra une erreur
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

  const completeMission = async () => {
    if (!activeMission) return;
    try {
      const res = await fetch(`${BACKEND_URL}/missions/${activeMission.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DELIVERED' }),
      });
      setActiveMission(await res.json());
    } catch (err) { console.error(err); }
  };

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
      <View style={styles.headerProfile}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image source={currentUser?.profileImage ? { uri: currentUser.profileImage } : { uri: 'https://via.placeholder.com/150' }} style={styles.miniAvatar} />
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.welcomeText}>👋 Bienvenue, {currentUser?.firstName} !</Text>
            <Text style={styles.roleText}>{currentUser?.email}</Text>
          </View>
        </View>
        <View style={[styles.miniStatusBadge, { backgroundColor: connected ? '#4CD964' : '#FF3B30' }]} />
      </View>

      {activeMission && activeMission.status === 'ACCEPTED' ? (
        <View style={styles.missionActiveCard}>
          <Text style={styles.missionActiveTitle}>🏃 MISSION EN COURS D'EXÉCUTION</Text>
          <Text style={styles.missionTitleText}>{activeMission.title}</Text>
          <Text style={styles.missionPriceText}>{activeMission.price} €</Text>
          <Text style={styles.missionDesc}>{activeMission.description}</Text>
          <TouchableOpacity style={styles.completeButton} onPress={completeMission}>
            <Text style={styles.buttonText}>✓ J'ai terminé la livraison !</Text>
          </TouchableOpacity>
        </View>
      ) : activeMission && activeMission.status === 'DELIVERED' ? (
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>🎉 Bravo {currentUser?.firstName} !</Text>
          <Text style={styles.successText}>Course terminée. Commission de {activeMission.price} € validée.</Text>
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

// Les styles restent identiques, pas de modifs ici
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
  headerProfile: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 14, marginBottom: 20 },
  miniAvatar: { width: 40, height: 40, borderRadius: 20 },
  welcomeText: { fontSize: 15, fontWeight: 'bold', color: '#1C1C1E' },
  roleText: { fontSize: 12, color: '#8E8E93' },
  miniStatusBadge: { width: 10, height: 10, borderRadius: 5 },
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
  missionDesc: { color: '#AEAEB2', fontSize: 13, marginVertical: 15 },
  completeButton: { backgroundColor: '#4CD964', padding: 14, borderRadius: 10, alignItems: 'center' },
  successCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: '#4CD964' },
  successTitle: { fontSize: 16, fontWeight: 'bold', color: '#4CD964' },
  successText: { fontSize: 13, color: '#3A3A3C', textAlign: 'center', marginTop: 5 },
  clearButton: { marginTop: 15, backgroundColor: '#F2F2F7', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8 },
  clearButtonText: { color: '#1C1C1E', fontWeight: '600' },
   modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, alignItems: 'center' },
  modalBadge: { color: '#007AFF', fontWeight: 'bold', fontSize: 10, backgroundColor: '#E5F1FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1C1C1E', marginTop: 8 },
  modalPrice: { fontSize: 28, fontWeight: '800', color: '#4CD964', marginVertical: 5 },
  modalButtonsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginTop: 15 },
  declineButton: { width: '46%', padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#FFE5E5' },
  acceptButton: { width: '46%', padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#1C1C1E' },
});