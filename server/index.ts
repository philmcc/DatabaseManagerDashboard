import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import { logger } from './utils/logger';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(requestLogger);

(async () => {
  const server = registerRoutes(app);

  app.use(errorHandler);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Use the originally configured port, falling back to alternatives if needed
  const DEFAULT_PORT = process.env.PORT || 5001;
  const FALLBACK_PORTS = [5002, 5003, 5004, 5005];
  
  // Try the default port first, then fallbacks if needed
  function startServer(port: number, fallbacks: number[] = []) {
    server.listen(port, "0.0.0.0")
      .on("error", (err: any) => {
        if (err.code === 'EADDRINUSE') {
          // Port is in use
          logger.warn(`Port ${port} is already in use`);
          
          if (fallbacks.length > 0) {
            // Try the next port in the fallback list
            const nextPort = fallbacks[0];
            logger.info(`Trying port ${nextPort} instead...`);
            startServer(nextPort, fallbacks.slice(1));
          } else {
            // No more fallbacks available
            logger.error("All ports are in use. Please close other applications or specify a different port.");
            process.exit(1);
          }
        } else {
          // Some other error occurred
          logger.error(`Failed to start server: ${err.message}`);
          process.exit(1);
        }
      })
      .on("listening", () => {
        logger.info(`Server running on port ${port}`);
      });
  }
  
  // Start the server with fallback ports
  startServer(Number(DEFAULT_PORT), FALLBACK_PORTS);
})();
