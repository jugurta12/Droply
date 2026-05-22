import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('positions_historique') 
export class LocationEntity {
  @PrimaryGeneratedColumn()
  id!: number; // <-- Ajoute le "!" ici

  @Column()
  userId!: string; // <-- Ajoute le "!" ici

  @Column('decimal', { precision: 10, scale: 7 })
  latitude!: number; // <-- Ajoute le "!" ici

  @Column('decimal', { precision: 10, scale: 7 })
  longitude!: number; // <-- Ajoute le "!" ici

  @CreateDateColumn()
  createdAt!: Date; // <-- Ajoute le "!" ici
}