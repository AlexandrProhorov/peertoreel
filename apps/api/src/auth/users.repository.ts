import { Injectable } from '@nestjs/common';
import type { UserRole } from '@kadence/contracts';
import { count, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { users } from '../db/schema.js';

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
}

export interface NewUser {
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const userColumns = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  passwordHash: users.passwordHash,
  role: users.role,
  isActive: users.isActive,
};

@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const [row] = await this.database.db
      .select(userColumns)
      .from(users)
      .where(eq(users.email, normalizeEmail(email)))
      .limit(1);

    return row ?? null;
  }

  async countAll(): Promise<number> {
    const [row] = await this.database.db
      .select({ value: count() })
      .from(users);

    return row?.value ?? 0;
  }

  async create(input: NewUser): Promise<UserRecord> {
    const [row] = await this.database.db
      .insert(users)
      .values({
        email: normalizeEmail(input.email),
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        role: input.role,
      })
      .returning(userColumns);

    if (!row) {
      throw new Error('Failed to insert user');
    }

    return row;
  }
}
