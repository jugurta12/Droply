import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum MissionStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DELIVERED = 'DELIVERED',
  REFUSED = 'REFUSED',
}

@Entity('missions')
export class MissionEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column()
  description!: string;

  @Column('decimal', { precision: 10, scale: 7 })
  pickupLatitude!: number;

  @Column('decimal', { precision: 10, scale: 7 })
  pickupLongitude!: number;

  @Column('decimal', { precision: 10, scale: 7 })
  deliveryLatitude!: number;

  @Column('decimal', { precision: 10, scale: 7 })
  deliveryLongitude!: number;

  @Column('decimal', { precision: 6, scale: 2 })
  price!: number; // Le montant de la course en € (ex: 15.50)

  @Column({
    type: 'enum',
    enum: MissionStatus,
    default: MissionStatus.PENDING,
  })
  status!: MissionStatus;

  @Column({ nullable: true })
  userId!: string; // L'ID du livreur assigné (ex: intervenant_jugurta_123)

  @CreateDateColumn()
  createdAt!: Date;
}