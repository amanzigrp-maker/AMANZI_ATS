import { pool } from '@/lib/database';
import { User, UserSchema } from '@/types/db';
import bcrypt from 'bcrypt';
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters long.' }),
  role: z.string(),
  created_by: z.number().optional().nullable(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

/**
 * Finds a user by their email address.
 * @param email - The email of the user to find.
 * @returns The user object or null if not found.
 */
/**
 * Finds a user by their ID.
 * @param id - The ID of the user to find.
 * @returns The user object or null if not found.
 */
export const findUserById = async (id: number): Promise<User | null> => {
  try {
    const { rows } = await pool.query<User>(
      'SELECT * FROM users WHERE userid = $1',
      [id]
    );
    if (rows.length === 0) {
      return null;
    }
    const user = {
      ...rows[0],
      userid: parseInt(rows[0].userid as any, 10),
      createdat: new Date(rows[0].createdat),
      updatedat: new Date(rows[0].updatedat),
      lastlogin: rows[0].lastlogin ? new Date(rows[0].lastlogin) : null,
      created_by: rows[0].created_by ? parseInt(rows[0].created_by as any, 10) : null,
    };
    return UserSchema.parse(user);
  } catch (error) {
    console.error('Error finding user by ID:', error);
    throw new Error('Could not retrieve user from database.');
  }
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
  try {
    const { rows } = await pool.query<User>(
      'SELECT * FROM users WHERE email ILIKE $1',
      [email]
    );
    if (rows.length === 0) {
      return null;
    }
    // Manually cast since pg returns all fields as strings initially
    // Manually cast since pg returns some fields as strings initially
    const user = {
      ...rows[0],
      userid: parseInt(rows[0].userid as any, 10),
      createdat: new Date(rows[0].createdat),
      updatedat: new Date(rows[0].updatedat),
      lastlogin: rows[0].lastlogin ? new Date(rows[0].lastlogin) : null,
      created_by: rows[0].created_by ? parseInt(rows[0].created_by as any, 10) : null,
    };
    return UserSchema.parse(user);
  } catch (error) {
    console.error('Error finding user by email:', error);
    throw new Error('Could not retrieve user from database.');
  }
};

/**
 * Creates a new user in the database.
 * @param userData - The data for the new user.
 * @returns The newly created user object.
 */
export const createUser = async (userData: CreateUserInput): Promise<User> => {
  const validation = CreateUserSchema.safeParse(userData);

  if (!validation.success) {
    throw new Error(`Invalid user data: ${JSON.stringify(validation.error.flatten().fieldErrors)}`);
  }

  const { email, password, role } = validation.data;

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw new Error('A user with this email address already exists.');
  }

  const saltRounds = 10;
  const passwordhash = await bcrypt.hash(password, saltRounds);

  try {
    const { rows } = await pool.query<User>(
      'INSERT INTO users (email, passwordhash, role, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, passwordhash, role.toLowerCase(), validation.data.created_by || null]
    );

    const newUser = {
      ...rows[0],
      userid: parseInt(rows[0].userid as any, 10),
      createdat: new Date(rows[0].createdat),
      updatedat: new Date(rows[0].updatedat),
      lastlogin: rows[0].lastlogin ? new Date(rows[0].lastlogin) : null,
      created_by: rows[0].created_by ? parseInt(rows[0].created_by as any, 10) : null,
    };

    return UserSchema.parse(newUser);
  } catch (error) {
    console.error('Error creating user:', error);
    throw new Error('Could not create user in database.');
  }
};
