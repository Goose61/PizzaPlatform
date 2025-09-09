const mongoose = require('mongoose');
const secretManager = require('./secrets');

class Database {
  constructor() {
    this.isConnected = false;
    this.reconnectTimer = null;
    this.monitoringInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  async connect() {
    try {
      // Load secrets securely
      const secrets = await secretManager.initialize();
      const mongoUri = secrets.mongoUri;
      
      // MongoDB connection options for improved stability and performance
      const options = {
        // Connection pool settings
        maxPoolSize: 15, // Increase pool size for better concurrency
        minPoolSize: 2, // Maintain minimum connections to avoid connection delays
        
        // Timeout settings - more aggressive for stability
        serverSelectionTimeoutMS: 10000, // Reduced from 30s to 10s for faster failure detection
        socketTimeoutMS: 0, // Disable socket timeout (keep connections alive indefinitely)
        connectTimeoutMS: 10000, // Reduced initial connection timeout
        
        // Keep-alive and heartbeat settings
        heartbeatFrequencyMS: 5000, // More frequent heartbeat (every 5s instead of 10s)
        maxIdleTimeMS: 0, // Never close idle connections (prevents disconnections)
        
        // Reliability settings
        retryWrites: true, // Enable retryable writes
        retryReads: true, // Enable retryable reads
        bufferCommands: false, // Disable mongoose buffering for immediate errors
        
        // Additional stability options
        serverApi: {
          version: '1',
          strict: true,
          deprecationErrors: true,
        },
        compressors: ['zlib'], // Enable compression to reduce network load
        
        // Auto-reconnection settings
        autoCreate: true,
        autoIndex: false, // Disable automatic index creation in production
      };

      console.log('📡 Connecting to MongoDB...');
      await mongoose.connect(mongoUri, options);
      
      this.isConnected = true;
      console.log('✅ MongoDB connected successfully');
      
      // Handle connection events with enhanced monitoring
      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err);
        this.isConnected = false;
        
        // Log specific error types for debugging
        if (err.name === 'MongoNetworkTimeoutError') {
          console.error('⚠️ Network timeout - check internet connection and MongoDB Atlas');
        } else if (err.name === 'MongoServerSelectionError') {
          console.error('⚠️ Server selection failed - MongoDB may be unavailable');
        }
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️ MongoDB disconnected - will attempt to reconnect');
        this.isConnected = false;
        
        // Start reconnection attempts
        this.scheduleReconnection();
      });

      mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconnected successfully');
        this.isConnected = true;
      });

      mongoose.connection.on('connected', () => {
        console.log('✅ MongoDB connected');
        this.isConnected = true;
      });

      mongoose.connection.on('connecting', () => {
        console.log('📡 Connecting to MongoDB...');
      });

      // Monitor connection health periodically
      this.startConnectionMonitoring();

      // Graceful shutdown
      process.on('SIGINT', async () => {
        await this.disconnect();
        process.exit(0);
      });

      return mongoose.connection;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect() {
    try {
      // Stop monitoring and reconnection attempts
      this.stopConnectionMonitoring();
      
      await mongoose.connection.close();
      this.isConnected = false;
      console.log('📴 MongoDB connection closed');
    } catch (error) {
      console.error('❌ Error closing MongoDB connection:', error);
      throw error;
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      name: mongoose.connection.name,
      host: mongoose.connection.host,
      port: mongoose.connection.port
    };
  }

  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: 'disconnected', error: 'Not connected to database' };
      }

      // Simple ping to check database responsiveness
      await mongoose.connection.db.admin().ping();
      
      return {
        status: 'healthy',
        connection: this.getConnectionStatus(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  scheduleReconnection() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Maximum reconnection attempts reached. Manual intervention required.');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff, max 30s
    this.reconnectAttempts++;

    console.log(`⏰ Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        if (mongoose.connection.readyState === 0) { // Disconnected
          console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}...`);
          await mongoose.connection.close();
          await this.connect();
          this.reconnectAttempts = 0; // Reset on successful connection
        }
      } catch (error) {
        console.error(`❌ Reconnection attempt ${this.reconnectAttempts} failed:`, error);
        this.scheduleReconnection(); // Try again
      }
    }, delay);
  }

  startConnectionMonitoring() {
    // Clear existing interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Monitor connection health every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      try {
        const health = await this.healthCheck();
        
        if (health.status === 'unhealthy' && this.isConnected) {
          console.warn('⚠️ Connection health check failed - initiating reconnection');
          this.isConnected = false;
          this.scheduleReconnection();
        }
      } catch (error) {
        console.error('❌ Connection monitoring error:', error);
      }
    }, 30000);
  }

  stopConnectionMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

module.exports = new Database(); 