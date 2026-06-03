# Droply – Écosystème de Livraison en Temps Réel

L'écosystème interconnecte une application mobile pour les livreurs, une console d'administration web pour le dispatch des missions, et un backend centralisé gérant les flux de données et les communications géospatiales en temps réel.

##  Architecture Globale

L'écosystème est découpé en trois :

1. **Backend (`backend/`)** : API REST et serveur WebSocket développés avec **NestJS** et **TypeORM**, connectés à une base de données **PostgreSQL** conteneurisée via **Docker**.
2. **Console Admin (`web-admin/`)** : Dashboard de supervision développé en **Next.js (App Router)** et **Tailwind CSS**. Intègre une cartographie dynamique via **Leaflet** pour le suivi de flotte.
3. **Application Mobile (`mobile/`)** : Application native destinée aux coursiers, développée avec **React Native (Expo)**, exploitant les capteurs de géolocalisation de l'appareil.

---

##  Fonctionnalités Majeures

* **Authentification et Cloisonnement des Rôles** : Gestion stricte des privilèges utilisateurs (`ADMIN`, `LIVREUR`, `CLIENT`) directement appliqués en base de données.
* **Tracking Géospatial Temps Réel** : Suivi des positions des coursiers via WebSockets (`Socket.io`) avec mise à jour instantanée sur la carte de l'administrateur.
* **Algorithme Haversine Local** : Calcul de distance matriciel à vol d'oiseau calculé côté client (mobile) pour informer le livreur de sa distance par rapport au colis en direct.
* **Sécurisation des Livraisons (OTP)** : Génération automatique d'un token secret à 3 chiffres lors de la création d'une course, requis par l'application mobile pour acter la livraison.
* **Persistance de Session** : Intégration d'un stockage persistant asynchrone (`AsyncStorage`) sur le mobile et du `localStorage` sur le web pour éviter les reconnexions intempestives.
* **Registre d'Administration** : Espace de gestion CRUD permettant à l'administrateur suprême de modifier les rôles ou de bannir des utilisateurs de l'infrastructure.

---

##  Pile Technologique

* **Framework Back** : NestJS (TypeScript)
* **Framework Front Web** : Next.js 14+ (Tailwind CSS)
* **Framework Mobile** : React Native (Expo)
* **Base de données** : PostgreSQL + TypeORM
* **Temps réel** : Socket.io (WebSockets)
* **Cartographie** : Leaflet / OpenStreetMap / Nominatim API
* **Conteneurisation** : Docker

---

##  Installation et Démarrage

### 1. Base de données (Docker)
Assurez-vous que Docker Desktop est démarré, puis lancez le conteneur PostgreSQL :
```bash
# Se connecter à la base de données via le terminal local
psql -U postgres -d droply_database -h localhost
# Mot de passe par défaut : droply_password123
