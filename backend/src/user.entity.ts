import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  firstName!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  password!: string; // Dans un vrai projet de prod, bcrypt ici

  @Column({ nullable: true })
  profileImage!: string; // URL ou base64 de la photo

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ default: 'LIVREUR' })
    role!: 'ADMIN' | 'LIVREUR' | 'CLIENT';
}