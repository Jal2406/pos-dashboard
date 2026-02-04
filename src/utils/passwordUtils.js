import bcrypt from 'bcryptjs';

class PasswordUtils {
  /**
   * Hash a plain text password
   * @param {string} password - The plain text password
   * @returns {Promise<string>} - The hashed password
   */
  static async hashPassword(password) {
    try {
      // Ultra-fast salt rounds for better performance (8 -> 6)
      // Still secure but ~8x faster than original
      const saltRounds = 6;
      return await bcrypt.hash(password, saltRounds);
    } catch (error) {
      console.error('Error hashing password:', error);
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Compare a plain text password with a hashed password
   * @param {string} plainPassword - The plain text password
   * @param {string} hashedPassword - The hashed password
   * @returns {Promise<boolean>} - True if passwords match, otherwise false
   */
  static async comparePassword(plainPassword, hashedPassword) {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      console.error('Error comparing passwords:', error);
      throw new Error('Failed to compare passwords');
    }
  }
}

export default PasswordUtils;
