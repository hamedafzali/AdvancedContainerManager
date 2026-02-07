"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || "5003");
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)("combined"));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Health check
app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        services: {
            docker: false,
            redis: false,
            terminal: false,
        },
    });
});
// System status
app.get("/api/system/status", (req, res) => {
    res.json({
        success: true,
        data: {
            docker: {
                connected: false,
                version: "Unknown",
                systemInfo: {},
            },
            metrics: {
                summary: {
                    projectsCount: 0,
                    containersCount: 0,
                    runningContainers: 0,
                },
            },
            timestamp: new Date().toISOString(),
        },
    });
});
// System metrics
app.get("/api/system/metrics", (req, res) => {
    res.json({
        success: true,
        data: {
            timestamp: new Date().toISOString(),
            cpuPercent: Math.random() * 80,
            memoryPercent: Math.random() * 80,
            diskUsage: Math.random() * 80,
            networkIO: {
                bytesRecv: Math.floor(Math.random() * 1024 * 1024),
                bytesSent: Math.floor(Math.random() * 1024 * 1024),
                dropin: 0,
                dropout: 0,
                errin: 0,
                errout: 0,
                packetsRecv: Math.floor(Math.random() * 10000),
                packetsSent: Math.floor(Math.random() * 10000),
            },
            loadAverage: [0.5, 0.3, 0.2],
        },
    });
});
// Containers
app.get("/api/containers", (req, res) => {
    res.json({
        success: true,
        data: [],
    });
});
// Projects
app.get("/api/projects", (req, res) => {
    res.json({
        success: true,
        data: {},
    });
});
// Images
app.get("/api/images", (req, res) => {
    res.json({
        success: true,
        data: [],
    });
});
// Networks
app.get("/api/networks", (req, res) => {
    res.json({
        success: true,
        data: [],
    });
});
// Volumes
app.get("/api/volumes", (req, res) => {
    res.json({
        success: true,
        data: [],
    });
});
// Terminal sessions
app.get("/api/terminal/sessions", (req, res) => {
    res.json({
        success: true,
        data: [],
    });
});
// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: "Internal Server Error",
    });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Not Found",
    });
});
// Start server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Advanced Container Manager running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`API: http://localhost:${PORT}/api`);
});
exports.default = app;
