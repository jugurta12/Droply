import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GpsGateway } from './gps.gateway';
import { LocationEntity } from './location.entity';
import { MissionEntity } from './mission.entity';
import { UserEntity } from './user.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'jugurta',
      password: 'droply_password123',
      database: 'droply_database',
      entities: [LocationEntity, MissionEntity, UserEntity],
      synchronize: true, // À désactiver en production !
    }),
    TypeOrmModule.forFeature([LocationEntity, MissionEntity, UserEntity]),
  ],
  controllers: [AppController],
  providers: [AppService, GpsGateway],
})
export class AppModule implements OnModuleInit {
  // On injecte la connexion à la base de données
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Cette fonction se lance automatiquement dès que la BDD est connectée et prête
  async onModuleInit() {
    try {
      await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS cube;');
      await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS earthdistance;');
      console.log('🌍 Extensions géospatiales prêtes dans PostgreSQL !');
    } catch (error) {
      console.error('❌ Erreur lors du chargement des extensions PostgreSQL :', error);
    }
  }
}