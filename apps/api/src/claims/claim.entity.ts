import type { ClaimApprovalMode, ClaimStatus } from '@foodcycle/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Offer } from '../offers/offer.entities.js';
import { Organization } from '../organizations/organization.entity.js';

const num = {
  to: (v?: number | null) => v,
  from: (v?: string | null) => (v == null ? null : Number(v)),
};

@Entity('claims')
export class Claim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'offer_id', type: 'uuid' })
  offerId: string;

  @ManyToOne(() => Offer)
  @JoinColumn({ name: 'offer_id' })
  offer?: Offer;

  @Column({ name: 'charity_id', type: 'uuid' })
  charityId: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'charity_id' })
  charity?: Organization;

  @Column({ name: 'quantity_kg', type: 'numeric', precision: 8, scale: 2, transformer: num })
  quantityKg: number;

  @Column({
    type: 'enum',
    enumName: 'claim_status',
    enum: [
      'PENDING_APPROVAL',
      'RESERVED',
      'PICKED_UP',
      'REJECTED',
      'APPROVAL_TIMEOUT',
      'EXPIRED',
      'CANCELLED_BY_CHARITY',
      'CANCELLED_BY_DONOR',
    ],
  })
  status: ClaimStatus;

  @Column({ name: 'approval_mode_applied', type: 'enum', enum: ['AUTO', 'MANUAL'], enumName: 'claim_approval_mode' })
  approvalModeApplied: ClaimApprovalMode;

  @Column({ name: 'approval_deadline', type: 'timestamptz', nullable: true })
  approvalDeadline: Date | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy: string | null;

  @Column({ name: 'reject_reason', type: 'varchar', length: 500, nullable: true })
  rejectReason: string | null;

  @Column({ name: 'reserved_until', type: 'timestamptz', nullable: true })
  reservedUntil: Date | null;

  @Column({ name: 'qr_token', type: 'varchar', length: 64, nullable: true, select: false })
  qrToken: string | null;

  @Column({ name: 'pickup_code', type: 'char', length: 6, nullable: true, select: false })
  pickupCode: string | null;

  @Column({ name: 'picked_up_at', type: 'timestamptz', nullable: true })
  pickedUpAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

export const ACTIVE_CLAIM_STATUSES: ClaimStatus[] = ['PENDING_APPROVAL', 'RESERVED'];
