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
    userId?: string;
    userIds?: string[];
  }) {
    const targetUserIds = body.userIds?.length ? body.userIds : body.userId ? [body.userId] : [];
    if (targetUserIds.length === 0) {
      throw new BadRequestException("Sélectionne au moins un livreur pour cette mission.");
    }

    const missions = targetUserIds.map((userId) => {
      const validationCode = Math.floor(100 + Math.random() * 900).toString();

      return this.missionRepository.create({
        title: body.title,
        description: body.description,
        pickupLatitude: body.pickupLatitude,
        pickupLongitude: body.pickupLongitude,
        deliveryLatitude: body.deliveryLatitude,
        deliveryLongitude: body.deliveryLongitude,
        price: body.price,
        userId,
        status: MissionStatus.PENDING,
        validationCode,
      });
    });

    const savedMissions = await this.missionRepository.save(missions);

    savedMissions.forEach((mission) => {
      this.gpsGateway.emitMissionToUser(mission.userId, mission);
    });

    return savedMissions.length === 1 ? savedMissions[0] : savedMissions;
  }
   
  @Put('missions/:id/status')
  async updateMissionStatus(
    @Param('id') id: number,
    @Body('status') status: MissionStatus,
    @Body('code') code?: string, 
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

  // 2. Récupérer TOUTES les missions d'un livreur (avec calcul de distance pour les PENDING)
  @Get('missions/user/:userId')
  async getUserMissions(@Param('userId') userId: string) {
    // A. Trouver le dernier point GPS connu de ce livreur
    const lastUserLocation = await this.locationRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const missions = await this.missionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    // C. Si on a le GPS du livreur, on calcule la distance à vol d'oiseau
    if (lastUserLocation) {
      const lat1 = lastUserLocation.latitude;
      const lng1 = lastUserLocation.longitude;

      return missions.map(mission => {
        const lat2 = mission.pickupLatitude;
        const lng2 = mission.pickupLongitude;

        // Formule de Haversine
        const R = 6371; 
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLng = (lng2 - lng1) * (Math.PI / 180);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        return {
          ...mission,
          distanceToPickup: distance.toFixed(1),
        };
      });
    }

    return missions.map(m => ({ ...m, distanceToPickup: null }));
  }

  // 3. Mettre à jour le statut d'une mission (Accepter / Terminer)
  @Post('auth/register')
  async register(@Body() body: { firstName: string; email: string; password:  string; profileImage: string }) {
    const existingUser = await this.userRepository.findOne({ where: { email: body.email } });
    if (existingUser) {
      return { error: "Cet email est déjà utilisé." };
    }

    const user = this.userRepository.create(body);
    const savedUser = await this.userRepository.save(user);
    
    // ⚡ INJECTION DU RÔLE DANS LA RÉPONSE REGISTER
    return { 
      success: true, 
      user: { 
        id: savedUser.id, 
        firstName: savedUser.firstName, 
        email: savedUser.email, 
        profileImage: savedUser.profileImage,
        role: savedUser.role // ◄── Rôle transmis au client
      } 
    };
  }

  // 2. ROUTE CONNEXION
  @Post('auth/login')
  async login(@Body() body: { email: string; password:  string }) {
    const user = await this.userRepository.findOne({ where: { email: body.email } });
    
    if (!user || user.password !== body.password) {
      return { error: "Email ou mot de passe incorrect." };
    }

    // ⚡ INJECTION DU RÔLE DANS LA RÉPONSE LOGIN
    return { 
      success: true, 
      user: { 
        id: user.id, 
        firstName: user.firstName, 
        email: user.email, 
        profileImage: user.profileImage,
        role: user.role // ◄── Rôle transmis au client
      } 
    };
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

    const missionIdToSend = Number(mission.id);
    await this.missionRepository.remove(mission);

    this.gpsGateway.server.emit('admin_mission_updated', { id: missionIdToSend, status: 'DELETED' }); 

    return { success: true, message: "Mission supprimée avec succès." };
  }

  // 4. Mettre à jour le profil d'un utilisateur (Prénom et Photo)
  @Put('auth/update-profile/:id')
  async updateProfile(
    @Param('id') id: number,
    @Body() body: { firstName: string; profileImage: string },
  ) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new BadRequestException("Utilisateur introuvable");
    }

    user.firstName = body.firstName;
    if (body.profileImage) {
      user.profileImage = body.profileImage;
    }

    const updatedUser = await this.userRepository.save(user);

    // ⚡ INJECTION DU RÔLE DANS LA RÉPONSE UPDATE PROFILE (Pour la cohérence mémoire)
    return { 
      success: true, 
      user: { 
        id: updatedUser.id, 
        firstName: updatedUser.firstName, 
        email: updatedUser.email, 
        profileImage: updatedUser.profileImage,
        role: updatedUser.role // ◄── Rôle transmis au client
      } 
    };
  }

  @Post('locations/background')
  async saveBackgroundLocation(@Body() body: { userId: string; latitude: number; longitude: number }) {
    const location = this.locationRepository.create({
      userId: body.userId,
      latitude: body.latitude,
      longitude: body.longitude,
    });
    await this.locationRepository.save(location);

    this.gpsGateway.server.emit('admin_location_moved', {
      userId: body.userId,
      latitude: body.latitude,
      longitude: body.longitude,
      timestamp: new Date(),
    });

    return { success: true };
  }

  // Récupérer tous les comptes pour la liste d'administration
  @Get('auth/users')
  async getAllUsers() {
    return this.userRepository.find({ order: { firstName: 'ASC' } });
  }

  // Changer le rôle d'un utilisateur
  @Put('auth/users/:id/role')
  async changeUserRole(@Param('id') id: number, @Body('role') role: string) {
    await this.userRepository.update(id, { role: role as any });
    return { success: true };
  }

  // Supprimer définitivement un utilisateur
  @Delete('auth/users/:id')
  async deleteUser(@Param('id') id: number) {
    await this.userRepository.delete(id);
    return { success: true };
  }
}
