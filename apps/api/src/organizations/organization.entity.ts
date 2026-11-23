import type { City, ClaimApprovalMode, OrgStatus, OrgType } from '@foodcycle/shared';
import type { Point } from 'geojson';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';

/** numeric(3,2) comes back from pg as a string; expose it as a number */
const numericTransformer = {
  to: (v?: number | null) => v,
  from: (v?: string | null) => (v == null ? null : Number(v)),
};

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({
    type: 'enum',
    enum: ['RESTAURANT', 'HOTEL', 'BAKERY', 'GROCERY', 'CHARITY', 'HUMANITARIAN'],
    enumName: 'org_type',
  })
  type: OrgType;

  @Column({ type: 'varchar', length: 32 })
  phone: string;

  @Column({ type: 'varchar', length: 300 })
  address: string;

  @Column({ type: 'enum', enum: ['DAMASCUS', 'ALEPPO'], enumName: 'city', default: 'DAMASCUS' })
  city: City;

  @Column({ type: 'varchar', length: 120 })
  area: string;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  location: Point;

  @Column({ name: 'registration_number', type: 'varchar', length: 80, nullable: true })
  registrationNumber: string | null;

  @Column({
    type: 'enum',
    enum: ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED'],
    enumName: 'org_status',
    default: 'PENDING_VERIFICATION',
  })
  status: OrgStatus;

  @Column({ name: 'status_reason', type: 'varchar', length: 500, nullable: true })
  statusReason: string | null;

  @Column({ name: 'trust_score', type: 'numeric', precision: 3, scale: 2, default: 4, transformer: numericTransformer })
  trustScore: number;

  @Column({
    name: 'claim_approval_mode',
    type: 'enum',
    enum: ['AUTO', 'MANUAL'],
    enumName: 'claim_approval_mode',
    default: 'AUTO',
  })
  claimApprovalMode: ClaimApprovalMode;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'verified_by', type: 'uuid', nullable: true })
  verifiedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
