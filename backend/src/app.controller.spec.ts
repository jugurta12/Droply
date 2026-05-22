import { Controller, Get, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationEntity } from './location.entity';

@Controller('locations')
export class AppController {
  constructor(
    @InjectRepository(LocationEntity)
    private readonly locationRepository: Repository<LocationEntity>,
  ) {}

  // Cette route permet de récupérer le tout dernier point GPS d'un utilisateur
  @Get('last/:userId')
  async getLastLocation(@Param('userId') userId: string) {
    const lastLocation = await this.locationRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' }, // On prend la plus récente
    });

    if (!lastLocation) {
      return { message: "Aucun historique pour cet utilisateur." };
    }

    return lastLocation;
  }
}