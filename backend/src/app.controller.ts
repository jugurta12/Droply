import { Controller, Get, Post, Body, Param, Put, Delete, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationEntity } from './location.entity';
import { MissionEntity, MissionStatus } from './mission.entity';
import { UserEntity } from './user.entity';
import { GpsGateway } from './gps.gateway';

@Controller()
export class AppController {
  constructor(
    @InjectRepository(LocationEntity)
    private readonly locationRepository: Repository<LocationEntity>,

    @InjectRepository(MissionEntity)
    private readonly missionRepository: Repository<MissionEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,

    private readonly gpsGateway: GpsGateway, // On injecte la Gateway pour envoyer des alertes temps réel
  ) {}

  @Get('locations/last/:userId')
  async getLastLocation(@Param('userId') userId: string) {
    const lastLocation = await this.locationRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (!lastLocation) return { message: "Aucun historique trouvé pour cet ID" };
    return lastLocation;
  }

  // 1. Créer et assigner une mission à un livreur
// 1. Créer et assigner une mission à un livreur avec génération du code secret
  @Post('missions')
  async createMission(@Body() body: {
    title: string;
    description: string;
    pickupLatitude: number;
    pickupLongitude: number;
    deliveryLatitude: number;
    deliveryLongitude: number;
    price: number;
    userId: string;
  }) {
    // On génère le code de sécurité à 3 chiffres sans toucher au reste de la logique
    const randomCode = Math.floor(100 + Math.random() * 900).toString();

    const mission = this.missionRepository.create({
      ...body,
      status: MissionStatus.PENDING,
      validationCode: randomCode, // ◄── Ajouté proprement ici
    });
    
    const savedMission = await this.missionRepository.save(mission);

    // ⚡ TEMPS RÉEL : On envoie une notification WebSocket au mobile du livreur ciblé !
    this.gpsGateway.server.emit('new_mission_alert', savedMission);

    return savedMission;
  }
   
  @Put('missions/:id/status')
  async updateMissionStatus(
    @Param('id') id: number,
    @Body('status') status: MissionStatus,
    @Body('code') code?: string, // ◄── Reçoit le code envoyé par le mobile
  ) {
    const mission = await this.missionRepository.findOne({ where: { id: Number(id) } });
    if (!mission) {
      throw new BadRequestException("Cette mission n'existe pas.");
    }

    // Sécurité : Si le livreur veut passer la course à DELIVERED, on valide le code
    if (status === MissionStatus.DELIVERED) {
      if (!code || mission.validationCode !== code) {
        throw new BadRequestException("Le code de sécurité est incorrect !");
      }
    }

    await this.missionRepository.update(id, { status });
    const updatedMission = await this.missionRepository.findOne({ where: { id: Number(id) } });

    // ⚡ TEMPS RÉEL : On prévient le Dashboard Web que le statut a changé
    this.gpsGateway.server.emit('admin_mission_updated', updatedMission);

    return updatedMission;
  }

  // 2. Récupérer les missions d'un livreur spécifique
  @Get('missions/user/:userId')
  async getUserMissions(@Param('userId') userId: string) {
    // A. Trouver le dernier point GPS connu de ce livreur
    const lastUserLocation = await this.locationRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    // B. Récupérer toutes les missions en attente
    const missions = await this.missionRepository.find({
      where: { status: MissionStatus.PENDING },
      order: { createdAt: 'DESC' },
    });

    // C. Si on a le GPS du livreur, on calcule la distance pour chaque mission en SQL/Maths
    if (lastUserLocation) {
      const lat1 = lastUserLocation.latitude;
      const lng1 = lastUserLocation.longitude;

      return missions.map(mission => {
        const lat2 = mission.pickupLatitude;
        const lng2 = mission.pickupLongitude;

        // Formule de Haversine pour calculer la distance à vol d'oiseau entre deux coordonnées GPS
        const R = 6371; // Rayon de la Terre en km
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLng = (lng2 - lng1) * (Math.PI / 180);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c; // Distance finale en kilomètres

        return {
          ...mission,
          distanceToPickup: distance.toFixed(1), // Arrondi à 1 chiffre après la virgule (ex: "2.4")
        };
      });
    }

    // Si le livreur n'a pas encore de point GPS, on renvoie les missions sans distance
    return missions.map(m => ({ ...m, distanceToPickup: null }));
  }

  // 3. Mettre à jour le statut d'une mission (Accepter / Terminer)
  @Post('auth/register')
  async register(@Body() body: { firstName: string; email: string; password:  string; profileImage: string }) {
    // Vérifier si l'email existe déjà
    const existingUser = await this.userRepository.findOne({ where: { email: body.email } });
    if (existingUser) {
      return { error: "Cet email est déjà utilisé." };
    }

    const user = this.userRepository.create(body);
    const savedUser = await this.userRepository.save(user);
    
    return { success: true, user: { id: savedUser.id, firstName: savedUser.firstName, email: savedUser.email, profileImage: savedUser.profileImage } };
  }

  // 2. ROUTE CONNEXION
  @Post('auth/login')
  async login(@Body() body: { email: string; password:  string }) {
    const user = await this.userRepository.findOne({ where: { email: body.email } });
    
    if (!user || user.password !== body.password) {
      return { error: "Email ou mot de passe incorrect." };
    }

    return { success: true, user: { id: user.id, firstName: user.firstName, email: user.email, profileImage: user.profileImage } };
  }

  @Delete('missions/:id')
  async deleteMission(@Param('id') id: number) {
    const mission = await this.missionRepository.findOne({ where: { id: Number(id) } });

    if (!mission) {
      throw new BadRequestException("Cette mission n'existe pas.");
    }

    if (mission.status !== MissionStatus.PENDING) {
      throw new BadRequestException("Impossible de supprimer une course déjà acceptée ou livrée !");
    }

    // On stocke l'ID numérique pur avant de détruire la ligne
    const missionIdToSend = Number(mission.id);

    await this.missionRepository.remove(mission);

    // ⚡ CORRECTIF : On envoie l'ID converti de force en Number()
    this.gpsGateway.server.emit('admin_mission_updated', { id: missionIdToSend, status: 'DELETED' }); 

    return { success: true, message: "Mission supprimée avec succès." };
  }
}