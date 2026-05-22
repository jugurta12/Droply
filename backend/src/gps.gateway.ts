import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationEntity } from './location.entity';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class GpsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // Map pour lier un socket.id à un userId (ex: "SwuzCGK..." -> "intervenant_jugurta_123")
  private activeConnections = new Map<string, string>();

  constructor(
    @InjectRepository(LocationEntity)
    private locationRepository: Repository<LocationEntity>,
  ) {}

  handleConnection(client: Socket) {
    // On log de manière plus discrète au début
    console.log(`🔌 Prise de contact socket : ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    // 1. On cherche si ce socket était lié à un utilisateur
    const userId = this.activeConnections.get(client.id);
    
    if (userId) {
      console.log(`❌ L'intervenant ${userId} s'est déconnecté (Socket: ${client.id})`);
      this.activeConnections.delete(client.id);

      // 2. On prévient immédiatement le Dashboard Admin de la déconnexion !
      this.server.emit('admin_user_offline', { userId });
    }
  }

  @SubscribeMessage('update_location')
  async handleLocationUpdate(client: Socket, payload: { userId: string; latitude: number; longitude: number }) {
    // Sauvegarder le lien entre le socket actuel et l'ID de l'intervenant
    this.activeConnections.set(client.id, payload.userId);

    // 1. Sauvegarde instantanée dans PostgreSQL
    try {
      const newLocation = this.locationRepository.create({
        userId: payload.userId,
        latitude: payload.latitude,
        longitude: payload.longitude,
      });
      await this.locationRepository.save(newLocation);
    } catch (error) {
      console.error("❌ Erreur sauvegarde BDD :", error);
    }

    // 2. Envoi synchrone au Dashboard Web Admin
    this.server.emit('admin_location_moved', {
      userId: payload.userId,
      latitude: payload.latitude,
      longitude: payload.longitude,
      timestamp: new Date(),
    });
  }
}