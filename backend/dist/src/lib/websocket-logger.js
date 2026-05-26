import { StructuredLogger } from "./pino.config";
import { v4 as uuidv4 } from "uuid";
export class WebSocketLogger {
    logger;
    socketContextMap = new Map();
    constructor() {
        this.logger = new StructuredLogger();
    }
    /**
     * Log socket connection
     */
    logConnection(socket) {
        const correlationId = uuidv4();
        const context = {
            socketId: socket.id,
            correlationId,
        };
        this.socketContextMap.set(socket.id, context);
        this.logger
            .withSocket(socket.id)
            .withCorrelationId(correlationId)
            .info("WebSocket connection established", {
            socketId: socket.id,
            remoteAddress: socket.handshake.address,
            userAgent: socket.handshake.headers["user-agent"],
        });
    }
    /**
     * Log socket disconnection
     */
    logDisconnection(socket, reason) {
        const context = this.socketContextMap.get(socket.id);
        const correlationId = context?.correlationId || uuidv4();
        this.logger
            .withSocket(socket.id)
            .withCorrelationId(correlationId)
            .info("WebSocket disconnection", {
            socketId: socket.id,
            reason,
            duration: socket.handshake.issued,
        });
        this.socketContextMap.delete(socket.id);
    }
    /**
     * Log socket event emission
     */
    logEmit(socket, eventName, data) {
        const context = this.socketContextMap.get(socket.id) || {
            socketId: socket.id,
            correlationId: uuidv4(),
        };
        this.logger
            .withSocket(socket.id, context.room)
            .withCorrelationId(context.correlationId)
            .debug("WebSocket emit", {
            socketId: socket.id,
            eventName,
            dataSize: this.getDataSize(data),
            timestamp: new Date().toISOString(),
        });
    }
    /**
     * Log socket event receipt
     */
    logReceive(socket, eventName, data) {
        const context = this.socketContextMap.get(socket.id) || {
            socketId: socket.id,
            correlationId: uuidv4(),
        };
        this.logger
            .withSocket(socket.id, context.room)
            .withCorrelationId(context.correlationId)
            .debug("WebSocket receive", {
            socketId: socket.id,
            eventName,
            dataSize: this.getDataSize(data),
            timestamp: new Date().toISOString(),
        });
    }
    /**
     * Log socket join room
     */
    logJoinRoom(socket, room, userId) {
        const context = this.socketContextMap.get(socket.id);
        if (context) {
            context.room = room;
            context.userId = userId;
        }
        this.logger
            .withSocket(socket.id, room)
            .withUser(userId)
            .info("Socket joined room", {
            socketId: socket.id,
            room,
            userId,
            timestamp: new Date().toISOString(),
        });
    }
    /**
     * Log socket leave room
     */
    logLeaveRoom(socket, room) {
        const context = this.socketContextMap.get(socket.id);
        if (context && context.room === room) {
            context.room = undefined;
        }
        this.logger
            .withSocket(socket.id, room)
            .info("Socket left room", {
            socketId: socket.id,
            room,
            timestamp: new Date().toISOString(),
        });
    }
    /**
     * Log socket broadcast
     */
    logBroadcast(sourceSocket, targetRoom, eventName, data) {
        const context = this.socketContextMap.get(sourceSocket.id);
        this.logger
            .withSocket(sourceSocket.id, targetRoom)
            .withCorrelationId(context?.correlationId || uuidv4())
            .debug("WebSocket broadcast", {
            sourceSocketId: sourceSocket.id,
            targetRoom,
            eventName,
            dataSize: this.getDataSize(data),
            timestamp: new Date().toISOString(),
        });
    }
    /**
     * Log socket error
     */
    logError(socket, eventName, error) {
        const context = this.socketContextMap.get(socket.id);
        this.logger
            .withSocket(socket.id, context?.room)
            .withCorrelationId(context?.correlationId || uuidv4())
            .error(`WebSocket error during ${eventName}`, error, {
            socketId: socket.id,
            eventName,
            errorMessage: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });
    }
    /**
     * Log socket performance metric
     */
    logPerformance(socket, operationName, durationMs, metadata) {
        const context = this.socketContextMap.get(socket.id);
        const level = durationMs > 1000 ? "warn" : "debug";
        const logData = {
            socketId: socket.id,
            operationName,
            durationMs,
            ...metadata,
            timestamp: new Date().toISOString(),
        };
        if (level === "warn") {
            this.logger
                .withSocket(socket.id, context?.room)
                .withCorrelationId(context?.correlationId || uuidv4())
                .warn(`Slow WebSocket operation: ${operationName}`, logData);
        }
        else {
            this.logger
                .withSocket(socket.id, context?.room)
                .withCorrelationId(context?.correlationId || uuidv4())
                .debug(`WebSocket operation: ${operationName}`, logData);
        }
    }
    /**
     * Get data size in bytes (for monitoring payload sizes)
     */
    getDataSize(data) {
        if (!data)
            return 0;
        if (typeof data === "string")
            return data.length;
        try {
            return JSON.stringify(data).length;
        }
        catch {
            return 0;
        }
    }
    /**
     * Set user context for a socket
     */
    setUserContext(socket, userId) {
        const context = this.socketContextMap.get(socket.id);
        if (context) {
            context.userId = userId;
        }
    }
    /**
     * Get context for a socket
     */
    getContext(socketId) {
        return this.socketContextMap.get(socketId);
    }
}
/**
 * Singleton instance for WebSocket logging
 */
export const wsLogger = new WebSocketLogger();
/**
 * Setup WebSocket logging for Socket.io server
 * Automatically logs all major events
 */
export const setupWebSocketLogging = (io) => {
    const logger = new StructuredLogger();
    io.on("connection", (socket) => {
        wsLogger.logConnection(socket);
        // Log all emitted events (be selective in production to avoid spam)
        socket.onAny((eventName, ...args) => {
            if (!eventName.startsWith("_")) {
                // Skip internal Socket.io events
                wsLogger.logReceive(socket, eventName, args[0]);
            }
        });
        socket.on("disconnect", (reason) => {
            wsLogger.logDisconnection(socket, reason);
        });
        socket.on("error", (error) => {
            wsLogger.logError(socket, "socket-error", error);
        });
        socket.on("connect_error", (error) => {
            wsLogger.logError(socket, "connect-error", error);
        });
    });
    logger.info("WebSocket logging initialized");
};
/**
 * Wrap Socket.io event handler with logging
 */
export const wrapSocketHandler = (socket, eventName, handler) => {
    socket.on(eventName, async (...args) => {
        const startTime = Date.now();
        const correlationId = uuidv4();
        try {
            wsLogger.logReceive(socket, eventName, args[0]);
            await handler(...args);
            const duration = Date.now() - startTime;
            wsLogger.logPerformance(socket, eventName, duration);
        }
        catch (error) {
            wsLogger.logError(socket, eventName, error instanceof Error ? error : new Error(String(error)));
        }
    });
};
/**
 * Intercept broadcast operations for logging
 */
export const createLoggedBroadcaster = (io) => {
    return {
        /**
         * Broadcast to room with logging
         */
        toRoom: (socket, room, eventName, data) => {
            wsLogger.logBroadcast(socket, room, eventName, data);
            socket.to(room).emit(eventName, data);
        },
        /**
         * Broadcast to all with logging
         */
        toAll: (socket, eventName, data) => {
            wsLogger.logBroadcast(socket, "all", eventName, data);
            socket.broadcast.emit(eventName, data);
        },
        /**
         * Send to specific socket with logging
         */
        toSocket: (socket, targetSocketId, eventName, data) => {
            wsLogger.logBroadcast(socket, targetSocketId, eventName, data);
            socket.to(targetSocketId).emit(eventName, data);
        },
    };
};
