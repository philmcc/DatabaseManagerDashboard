import { Client } from 'ssh2';
import { EventEmitter } from 'events';
import * as net from 'net';
import { logger } from './logger';

export interface SSHTunnelConfig {
  sshHost: string;
  sshPort: number;
  sshUsername: string;
  sshPassword?: string;
  sshPrivateKey?: string;
  sshKeyPassphrase?: string;
  dbHost: string;
  dbPort: number;
}

export class SSHTunnel extends EventEmitter {
  private server: net.Server | null = null;
  private sshClient: Client | null = null;
  private localPort: number | null = null;
  private config: SSHTunnelConfig;
  
  constructor(config: SSHTunnelConfig) {
    super();
    this.config = config;
  }
  
  async connect(): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        this.sshClient = new Client();
        
        // Set up authentication method
        const sshConfig: any = {
          host: this.config.sshHost,
          port: this.config.sshPort,
          username: this.config.sshUsername,
        };
        
        if (this.config.sshPrivateKey) {
          sshConfig.privateKey = this.config.sshPrivateKey;
          if (this.config.sshKeyPassphrase) {
            sshConfig.passphrase = this.config.sshKeyPassphrase;
          }
        } else if (this.config.sshPassword) {
          sshConfig.password = this.config.sshPassword;
        }
        
        // Create a TCP server to listen for local connections
        this.server = net.createServer((socket) => {
          this.sshClient?.forwardOut(
            'localhost',
            this.localPort!,
            this.config.dbHost,
            this.config.dbPort,
            (err, stream) => {
              if (err) {
                logger.error('SSH tunnel forward error:', err);
                socket.end();
                return;
              }
              
              // Connect the local socket to the remote stream
              socket.pipe(stream);
              stream.pipe(socket);
              
              stream.on('error', (err) => {
                logger.error('SSH stream error:', err);
                socket.end();
              });
              
              socket.on('error', (err) => {
                logger.error('Local socket error:', err);
                stream.end();
              });
            }
          );
        });
        
        // Find an available local port
        this.server.listen(0, 'localhost', () => {
          const address = this.server?.address() as net.AddressInfo;
          this.localPort = address.port;
          logger.info(`SSH tunnel server listening on localhost:${this.localPort}`);
          
          // Connect to SSH server
          this.sshClient?.on('ready', () => {
            logger.info('SSH connection established');
            resolve(this.localPort!);
          });
          
          this.sshClient?.on('error', (err) => {
            logger.error('SSH client error:', err);
            this.close();
            reject(err);
          });
          
          this.sshClient?.connect(sshConfig);
        });
        
        // Handle server errors
        this.server.on('error', (err) => {
          logger.error('SSH tunnel server error:', err);
          this.close();
          reject(err);
        });
        
      } catch (error) {
        logger.error('Error setting up SSH tunnel:', error);
        this.close();
        reject(error);
      }
    });
  }
  
  close() {
    if (this.sshClient) {
      this.sshClient.end();
      this.sshClient = null;
    }
    
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    
    this.localPort = null;
    logger.info('SSH tunnel closed');
  }
} 