/**
 * Request and response bodies of the server API (section 8.4). Null values are always sent explicitly.
 */
import type { Entry, Profile } from '../domain/types';

export interface HealthResponse {
  status: string;
  serverId: string;
  serverVersion: string;
  apiVersion: number;
  minAppVersion: string;
}

export interface PairRequest {
  code: string;
  deviceName: string;
  publicKey: string;
  signature: string;
}

export interface PairResponse {
  deviceId: string;
  serverId: string;
}

export interface ChallengeResponse {
  nonce: string;
  expiresAt: string;
}

export interface TokenRequest {
  deviceId: string;
  nonce: string;
  signature: string;
}

export interface TokenResponse {
  accessToken: string;
  expiresAt: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

export interface PairingCodeResponse {
  code: string;
  expiresAt: string;
}

/** The entry fields that travel in push and pull. */
export type EntryFields = Omit<Entry, 'eatenLocalDate'>;

/** A server record (pull, and `current` of a rejected change). */
export interface EntryRecord extends EntryFields {
  version: number;
}

/** A pushed entry change (6.2). Deletes carry their last known values too. */
export interface EntryChange extends EntryFields {
  baseVersion: number | null;
}

/** The profile fields that travel in push and pull. */
export type ProfileFields = Profile;

export interface ProfileRecord extends ProfileFields {
  version: number;
}

export interface ProfileChange extends ProfileFields {
  baseVersion: number | null;
}

export type PushStatus = 'applied' | 'rejected';

export type ConflictReason = 'deleteConflict' | 'olderEdit';

export interface EntryPushResult {
  id: string;
  status: PushStatus;
  version: number | null;
  reason: ConflictReason | null;
  current: EntryRecord | null;
}

export interface ProfilePushResult {
  status: PushStatus;
  version: number;
  reason: ConflictReason | null;
  current: ProfileRecord | null;
}

export interface PushRequest {
  entries: EntryChange[];
  profile: ProfileChange | null;
}

export interface PushResponse {
  entries: EntryPushResult[];
  profile: ProfilePushResult | null;
}

export interface PullResponse {
  entries: EntryRecord[];
  profile: ProfileRecord | null;
  nextCursor: number;
  hasMore: boolean;
}
