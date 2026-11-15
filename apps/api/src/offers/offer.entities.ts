import type { Allergen, ClaimApprovalMode, OfferStatus, StorageCondition } from '@foodcycle/shared';
import type { Point } from 'geojson';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity.js';

/** pg returns numeric as string; expose numbers */
const num = {
  to: (v?: number | null) => v,
  from: (v?: string | null) => (v == null ? null : Number(v)),
};

@Entity('food_categories')
export class FoodCategory {
  @PrimaryColumn({ type: 'smallint' })
  id: number;

  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ name: 'safe_hours', type: 'numeric', transformer: num })
  safeHours: number;

  @Column({ name: 'portion_kg', type: 'numeric', transformer: num })
  portionKg: number;

  @Column({ name: 'needs_cold_chain', type: 'boolean' })
  needsColdChain: boolean;

  @Column({ name: 'sort_order', type: 'smallint' })
  sortOrder: number;
}

@Entity('offers')
export class Offer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'donor_id', type: 'uuid' })
  donorId: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'donor_id' })
  donor?: Organization;

  @Column({ name: 'category_id', type: 'smallint' })
  categoryId: number;

  @ManyToOne(() => FoodCategory)
  @JoinColumn({ name: 'category_id' })
  category?: FoodCategory;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  ingredients: string | null;

  @Column({ type: 'text', array: true, default: () => `'{}'` })
  allergens: Allergen[];

  @Column({ name: 'allergens_declared', type: 'boolean' })
  allergensDeclared: boolean;

  @Column({
    name: 'storage_condition',
    type: 'enum',
    enum: ['ROOM_TEMP', 'HOT', 'REFRIGERATED', 'FROZEN'],
    enumName: 'storage_condition',
  })
  storageCondition: StorageCondition;

  @Column({ name: 'storage_instructions', type: 'varchar', length: 500, nullable: true })
  storageInstructions: string | null;

  @Column({ name: 'photo_url', type: 'varchar', length: 500, nullable: true })
  photoUrl: string | null;

  @Column({ name: 'quantity_kg', type: 'numeric', precision: 8, scale: 2, transformer: num })
  quantityKg: number;

  @Column({ name: 'remaining_kg', type: 'numeric', precision: 8, scale: 2, transformer: num })
  remainingKg: number;

  @Column({ type: 'integer', nullable: true })
  portions: number | null;

  @Column({ name: 'prepared_at', type: 'timestamptz' })
  preparedAt: Date;

  @Column({ name: 'ready_at', type: 'timestamptz' })
  readyAt: Date;

  @Column({ name: 'pickup_by', type: 'timestamptz' })
  pickupBy: Date;

  @Column({ name: 'effective_deadline', type: 'timestamptz' })
  effectiveDeadline: Date;

  @Column({
    name: 'claim_approval_mode',
    type: 'enum',
    enum: ['AUTO', 'MANUAL'],
    enumName: 'claim_approval_mode',
    nullable: true,
  })
  claimApprovalMode: ClaimApprovalMode | null;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  location: Point;

  @Column({ name: 'pickup_address', type: 'varchar', length: 300 })
  pickupAddress: string;

  @Column({ type: 'varchar', length: 120 })
  area: string;

  @Column({
    type: 'enum',
    enum: ['PUBLISHED', 'RESERVED', 'COMPLETED', 'EXPIRED', 'CANCELLED'],
    enumName: 'offer_status',
    default: 'PUBLISHED',
  })
  status: OfferStatus;

  @Column({ name: 'cancel_reason', type: 'varchar', length: 500, nullable: true })
  cancelReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
