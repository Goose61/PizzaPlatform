const mongoose = require('mongoose');

/**
 * Database Transaction Utility
 * 
 * Provides atomic database operations to ensure data consistency
 * Critical for financial operations like rewards distribution and vault management
 */
class DatabaseTransaction {
  constructor() {
    this.session = null;
  }

  /**
   * Start a database transaction
   * @returns {Promise<void>}
   */
  async start() {
    this.session = await mongoose.startSession();
    this.session.startTransaction();
  }

  /**
   * Commit the transaction
   * @returns {Promise<void>}
   */
  async commit() {
    if (this.session) {
      await this.session.commitTransaction();
      this.session.endSession();
      this.session = null;
    }
  }

  /**
   * Rollback the transaction
   * @returns {Promise<void>}
   */
  async rollback() {
    if (this.session) {
      await this.session.abortTransaction();
      this.session.endSession();
      this.session = null;
    }
  }

  /**
   * Get the current session for use in database operations
   * @returns {ClientSession} - MongoDB session
   */
  getSession() {
    return this.session;
  }

  /**
   * Execute a function within a database transaction
   * @param {Function} operation - Async function to execute
   * @returns {Promise<any>} - Result of the operation
   */
  static async execute(operation) {
    const transaction = new DatabaseTransaction();
    try {
      await transaction.start();
      const result = await operation(transaction.getSession());
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

/**
 * Convenience function for executing atomic operations
 * @param {Function} operation - Async function that takes a session parameter
 * @returns {Promise<any>} - Result of the operation
 */
async function withTransaction(operation) {
  return DatabaseTransaction.execute(operation);
}

module.exports = {
  DatabaseTransaction,
  withTransaction
};